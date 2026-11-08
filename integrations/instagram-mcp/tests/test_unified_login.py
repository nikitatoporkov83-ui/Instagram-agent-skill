"""Meta Unified Login uses Facebook Graph and an explicit Instagram account ID."""
from __future__ import annotations

import json

import httpx
import pytest
import respx

from instagram_mcp import russian_server as ru
from instagram_mcp.client import InstagramAPIError, InstagramClient
from instagram_mcp.config import Config

ACCOUNT = '17840000000000123'
FB = 'https://graph.facebook.com/v23.0'


@pytest.fixture
def unified(env,monkeypatch,tmp_path):
    monkeypatch.setenv('INSTAGRAM_LOGIN_MODE','unified')
    monkeypatch.setenv('INSTAGRAM_IG_USER_ID',ACCOUNT)
    monkeypatch.setenv('INSTAGRAM_DATA_DIR',str(tmp_path/'unified-journal'))


async def call(name,**arguments):
    value = await ru.mcp.call_tool(name,arguments)
    if isinstance(value,tuple):
        return value[1]
    if isinstance(value,dict):
        return value
    return json.loads(value[0].text)


@respx.mock
async def test_unified_profile_targets_the_instagram_account_not_facebook_me(unified):
    route = respx.get(FB+'/'+ACCOUNT).mock(return_value=httpx.Response(200,json={'id':ACCOUNT,'username':'unified_creator'}))
    result = await call('validate_access_token')
    assert result['ok'] and result['account']['username']=='unified_creator'
    assert route.call_count==1
    request = route.calls[0].request
    assert request.headers['Authorization']=='Bearer IGTOK'
    assert 'access_token' not in request.url.params
    assert all(r.request.url.host=='graph.facebook.com' for r in respx.calls)


@respx.mock
async def test_unified_media_and_comments_stay_on_facebook_graph(unified):
    feed = respx.get(FB+'/'+ACCOUNT+'/media').mock(return_value=httpx.Response(200,json={'data':[{'id':'M1'}]}))
    comments = respx.get(FB+'/M1/comments').mock(return_value=httpx.Response(200,json={'data':[{'id':'C1','text':'Вопрос'}]}))
    assert (await call('get_media_posts'))['data'][0]['id']=='M1'
    assert (await call('get_comments',media_id='M1'))['data'][0]['text']=='Вопрос'
    assert feed.call_count==comments.call_count==1


@respx.mock
async def test_unified_reel_still_requires_confirmation_and_never_duplicates(unified):
    respx.get(FB+'/'+ACCOUNT).mock(return_value=httpx.Response(200,json={'id':ACCOUNT,'username':'unified_creator'}))
    create = respx.post(FB+'/'+ACCOUNT+'/media').mock(return_value=httpx.Response(200,json={'id':'container'}))
    respx.get(FB+'/container').mock(return_value=httpx.Response(200,json={'status_code':'FINISHED'}))
    publish = respx.post(FB+'/'+ACCOUNT+'/media_publish').mock(return_value=httpx.Response(200,json={'id':'posted'}))
    respx.get(FB+'/posted').mock(return_value=httpx.Response(200,json={'permalink':'https://www.instagram.com/reel/posted/'}))
    draft = await call('publish_reel',video_url='https://media.example/reel.mp4',caption='Публикация после проверки')
    assert draft['status']=='prepared' and create.call_count==publish.call_count==0
    args={'request_id':draft['id'],'confirmation_code':draft['confirmation_code']}
    completed = await call('confirm_action',**args)
    assert completed['status']=='succeeded'
    await call('confirm_action',**args)
    assert create.call_count==publish.call_count==1


@respx.mock
async def test_unified_comment_reply_uses_the_same_confirmed_flow(unified):
    respx.get(FB+'/'+ACCOUNT).mock(return_value=httpx.Response(200,json={'id':ACCOUNT,'username':'unified_creator'}))
    post = respx.post(FB+'/C1/replies').mock(return_value=httpx.Response(200,json={'id':'reply'}))
    draft = await call('reply_to_comment',comment_id='C1',message='Спасибо за вопрос!')
    assert post.call_count==0
    result = await call('confirm_action',request_id=draft['id'],confirmation_code=draft['confirmation_code'])
    assert result['status']=='succeeded' and post.call_count==1


async def test_unified_requires_explicit_account_id(unified,monkeypatch):
    monkeypatch.delenv('INSTAGRAM_IG_USER_ID')
    result = await call('validate_access_token')
    assert not result['ok'] and 'INSTAGRAM_IG_USER_ID' in result['message']
    for value in ('me','123/../456','https://other.example','123?access_token=secret'):
        monkeypatch.setenv('INSTAGRAM_IG_USER_ID',value)
        with pytest.raises(RuntimeError,match='INSTAGRAM_IG_USER_ID'):
            Config.from_env()


async def test_unified_diagnostics_use_the_correct_permission_family(unified):
    result = await call('connection_status')
    assert result['login_mode']=='unified' and result['api_host']=='graph.facebook.com'
    assert 'instagram_content_publish' in result['scopes']
    assert 'instagram_business_content_publish' not in result['scopes']


def test_unified_does_not_refresh_a_system_user_token_as_an_instagram_user(unified):
    client = InstagramClient(Config.from_env(),http=httpx.AsyncClient())
    with pytest.raises(InstagramAPIError,match='Unified Login'):
        client._url('refresh_access_token')


@respx.mock
async def test_instagram_login_never_silently_forwards_a_credential_to_facebook(env):
    # Credential values may be placeholders. No prefix sniffing or failed-token
    # fallback may send them to another service without explicit configuration.
    respx.get('https://graph.instagram.com/v23.0/me').mock(return_value=httpx.Response(401,json={'error':{'code':190,'message':'Cannot parse access token'}}))
    result = await call('validate_access_token')
    assert not result['ok']
    assert all(r.request.url.host=='graph.instagram.com' for r in respx.calls)
