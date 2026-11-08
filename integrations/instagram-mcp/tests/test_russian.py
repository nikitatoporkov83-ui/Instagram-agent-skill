"""Exercise the actual registered MCP tools, not unguarded upstream functions."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import shutil

import httpx
import pytest
import respx

from instagram_mcp import russian_server as ru
from instagram_mcp.actions import Journal
from instagram_mcp.russian import clean

IG = 'https://graph.instagram.com/v23.0'


async def call(name, **arguments):
    value = await ru.mcp.call_tool(name,arguments)
    if isinstance(value,tuple):
        return value[1]
    if isinstance(value,dict):
        return value
    return json.loads(value[0].text)


@pytest.fixture
def studio_env(env,monkeypatch,tmp_path):
    monkeypatch.setenv('INSTAGRAM_DATA_DIR',str(tmp_path/'journal'))
    monkeypatch.delenv('INSTAGRAM_API_VERSION',raising=False)
    return tmp_path


def profile(user='1',username='creator'):
    return respx.get(IG+'/me').mock(return_value=httpx.Response(200,json={'id':user,'username':username}))


async def test_russian_catalog_and_no_raw_credential_tools():
    tools = await ru.mcp.list_tools()
    names = {tool.name for tool in tools}
    assert {'publish_reel','reply_to_comment','confirm_action','get_action_history','prepare_studio_reel'} <= names
    assert not {'refresh_access_token','refresh_tokens','send_dm','get_conversations'} & names
    assert all(any('а'<=c.lower()<='я' for c in tool.description) for tool in tools)
    for tool in tools:
        assert all('description' in p for p in tool.inputSchema.get('properties',{}).values())
    prompts = await ru.mcp.list_prompts()
    assert prompts[0].name == 'instagram_assistant_ru'
    assert 'дождись явного' in ru.INSTRUCTIONS


@respx.mock
async def test_missing_token_is_russian_and_makes_no_request(studio_env,monkeypatch):
    monkeypatch.delenv('INSTAGRAM_ACCESS_TOKEN')
    result = await call('validate_access_token')
    assert result['ok'] is False and 'защищённые' in result['message']
    assert len(respx.calls) == 0


@respx.mock
async def test_preview_then_confirm_reel_is_account_bound_and_idempotent(studio_env):
    profile()
    create = respx.post(IG+'/me/media').mock(return_value=httpx.Response(200,json={'id':'container'}))
    respx.get(IG+'/container').mock(return_value=httpx.Response(200,json={'status_code':'FINISHED'}))
    publish = respx.post(IG+'/me/media_publish').mock(return_value=httpx.Response(200,json={'id':'published'}))
    respx.get(IG+'/published').mock(return_value=httpx.Response(200,json={'permalink':'https://www.instagram.com/reel/example/'}))
    prepared = await call('publish_reel',video_url='https://media.example/reel.mp4',caption='Мой ролик на русском')
    assert prepared['status']=='prepared' and prepared['account']['username']=='creator'
    assert create.call_count == publish.call_count == 0
    options = {'request_id':prepared['id'],'confirmation_code':prepared['confirmation_code']}
    results = await asyncio.gather(call('confirm_action',**options),call('confirm_action',**options))
    assert all(r['status'] in ('running','succeeded') for r in results)
    completed = await call('confirm_action',**options)
    assert completed['status']=='succeeded'
    assert completed['result']['permalink'].startswith('https://www.instagram.com/reel/')
    assert create.call_count == publish.call_count == 1
    assert create.calls[0].request.headers['authorization']=='Bearer IGTOK'
    assert 'access_token' not in str(create.calls[0].request.url)
    history = await call('get_action_history')
    assert history['actions'][0]['status_ru']=='Выполнено'
    assert 'confirmation_code' not in json.dumps(history)


@respx.mock
async def test_russian_comment_waits_for_confirmation(studio_env):
    profile()
    reply = respx.post(IG+'/C1/replies').mock(return_value=httpx.Response(200,json={'id':'R1'}))
    text = 'Спасибо за вопрос! Источник проверю перед публикацией.'
    prepared = await call('reply_to_comment',comment_id='C1',message=text)
    assert prepared['arguments']['message']==text and reply.call_count==0
    result = await call('confirm_action',request_id=prepared['id'],confirmation_code=prepared['confirmation_code'])
    assert result['status']=='succeeded' and reply.call_count==1
    assert reply.calls[0].request.url.params['message']==text


@respx.mock
async def test_cancel_expiry_wrong_code_and_account_switch_never_post(studio_env):
    current = profile()
    prepared = await call('reply_to_comment',comment_id='C1',message='Мой ответ')
    ident,code = prepared['id'],prepared['confirmation_code']
    assert not (await call('confirm_action',request_id=ident,confirmation_code='wrong'))['ok']
    current.mock(return_value=httpx.Response(200,json={'id':'2','username':'another'}))
    assert 'другой аккаунт' in (await call('confirm_action',request_id=ident,confirmation_code=code))['message']
    await call('cancel_action',request_id=ident)
    assert (await call('confirm_action',request_id=ident,confirmation_code=code))['status']=='cancelled'
    assert all(r.request.method=='GET' for r in respx.calls)
    current.mock(return_value=httpx.Response(200,json={'id':'1','username':'creator'}))
    another = await call('reply_to_comment',comment_id='C1',message='Другой ответ')
    with ru.journal().db() as db:
        db.execute('UPDATE actions SET expires_at=0 WHERE id=?',(another['id'],))
    assert 'устарел' in (await call('confirm_action',request_id=another['id'],confirmation_code=another['confirmation_code']))['message']


@respx.mock
async def test_an_ambiguous_write_is_not_retried(studio_env):
    profile()
    reply = respx.post(IG+'/C1/replies').mock(side_effect=httpx.ReadTimeout('secret must not be echoed'))
    prepared = await call('reply_to_comment',comment_id='C1',message='Спасибо!')
    options = {'request_id':prepared['id'],'confirmation_code':prepared['confirmation_code']}
    first = await call('confirm_action',**options)
    assert first['status']=='uncertain'
    await call('confirm_action',**options)
    assert reply.call_count==1
    assert 'secret must not be echoed' not in json.dumps(first)


@respx.mock
async def test_invalid_media_rejected_before_any_request(studio_env):
    for url in ('http://media.example/a.mp4','https://127.0.0.1/a.mp4','https://user:pass@media.example/a.mp4','https://media.local/a.mp4'):
        assert not (await call('publish_reel',video_url=url,caption='Тест'))['ok']
    assert not (await call('reply_to_comment',comment_id='C1',message=''))['ok']
    assert len(respx.calls)==0


def test_journal_survives_restart_without_saving_confirmation_code(tmp_path):
    first = Journal(tmp_path)
    result = first.prepare('reply_to_comment',{'message':'Ответ'},{'id':'1','username':'creator'})
    second = Journal(tmp_path)
    assert second.verify(result['id'],result['confirmation_code'])['status']=='prepared'
    assert result['confirmation_code'].encode() not in first.path.read_bytes()
    assert second.cancel(result['id'])['status']=='cancelled'


def test_output_sanitizes_nested_tokens_and_pagination():
    result = clean({'access_token':'secret','data':[{'id':'1'}],
                    'paging':{'next':'https://graph.instagram.com/media?access_token=secret&after=cursor'}})
    assert 'secret' not in json.dumps(result) and 'cursor' in json.dumps(result)


@respx.mock
async def test_provider_error_never_echoes_token(studio_env):
    respx.get(IG+'/me').mock(return_value=httpx.Response(400,json={'error':{'code':190,'message':'secret IGTOK'}}))
    result = await call('validate_access_token')
    assert 'отклонила' in result['message'] and 'IGTOK' not in json.dumps(result)


@respx.mock
async def test_studio_handoff_without_token_is_read_only(studio_env,monkeypatch):
    root = studio_env/'workspace'
    (root/'scripts').mkdir(parents=True)
    (root/'web').mkdir()
    source = Path(__file__).resolve().parents[3]/'scripts/instagram_publication.py'
    shutil.copyfile(source,root/'scripts/instagram_publication.py')
    (root/'web/integration-config.js').write_text("globalThis.IG_CONFIG={instagramApiUrl:'https://studio-api.example'};")
    monkeypatch.setenv('INSTAGRAM_STUDIO_ROOT',str(root))
    monkeypatch.delenv('INSTAGRAM_ACCESS_TOKEN')
    prepared = await call('prepare_studio_reel',video_url='https://media.example/reel.mp4',caption='Новый ролик',share_link=False)
    assert prepared['ok'] and prepared['requires_confirmation'] and len(respx.calls)==0
    job = json.loads(next((root/'artifacts/instagram-requests').glob('job-*.json')).read_text())
    tracker = respx.get('https://studio-api.example/api/tracking/'+job['trackingToken']).mock(return_value=httpx.Response(200,json={'id':'one','status':'prepared','permalink':None,'updatedAt':100}))
    result = await call('get_studio_request_status',request_id=prepared['request_id'])
    assert result['status']=='prepared'
    assert 'authorization' not in tracker.calls[0].request.headers
