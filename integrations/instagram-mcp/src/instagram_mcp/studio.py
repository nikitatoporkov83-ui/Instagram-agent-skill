"""Handoff to the existing studio's owner-confirmed publishing flow."""
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlencode

import httpx

from .russian import clean


def workspace():
    root = Path(os.getenv('INSTAGRAM_STUDIO_ROOT','')).resolve()
    source = root/'scripts/instagram_publication.py'
    if not source.is_file() or not (root/'web/integration-config.js').is_file():
        raise ValueError('Не найдена веб-студия. Запускайте помощника через integrations/instagram-mcp/run.py из проекта insta.studio.')
    spec = importlib.util.spec_from_file_location('studio_handoff',source)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    return root,helper


async def prepare_studio_reel(video_url: str, caption: str, share_link: bool = True) -> dict[str,Any]:
    """Передать Reels на проверку в веб-студию; ничего не публикует."""
    try:
        root,helper = workspace()
        request = helper.make_request(video_url,caption)
        folder = root/'artifacts/instagram-requests'
        folder.mkdir(parents=True,exist_ok=True)
        ident = request['clientRequestId']
        request_file = folder/f'publication-{ident}.json'
        request_file.write_text(json.dumps(request,ensure_ascii=False,indent=2)+'\n')
        record = await asyncio.to_thread(helper.share_request,request) if share_link else None
        api = helper.configured_api()
        approval = helper.SITE+'?'+urlencode({'publish_request':record})+'#instagram' if record else None
        job = {'version':1,'clientRequestId':ident,'trackingToken':request['trackingToken'],
               'apiUrl':api,'requestFile':str(request_file),'approvalUrl':approval}
        (folder/f'job-{ident}.json').write_text(json.dumps(job,ensure_ascii=False,indent=2)+'\n')
        return {'ok':True,'request_id':ident,'request_file':str(request_file),'approval_url':approval,
                'service_configured':bool(api),'requires_confirmation':True,
                'message':'Запрос готов. Откройте его в студии, проверьте аккаунт и подтвердите отправку.' if api
                          else 'Запрос сохранён, но сервис веб-публикаций ещё не настроен. Отправка не выполнялась.'}
    except (ValueError,OSError):
        return {'ok':False,'message':'Не удалось подготовить запрос. Проверьте ссылку на видео, длину подписи, наличие студии и настройку Apify для ссылки.'}


async def get_studio_request_status(request_id: str) -> dict[str,Any]:
    """Прочитать статус одной отправки через студию без Instagram-токена."""
    try:
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}',request_id):
            raise ValueError()
        root,helper = workspace()
        job = json.loads((root/f'artifacts/instagram-requests/job-{request_id}.json').read_text())
        api = helper.configured_api()
        if not api:
            return {'ok':False,'message':'Сервис веб-публикаций ещё не настроен.'}
        token = job.get('trackingToken','')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):
            raise ValueError()
        async with httpx.AsyncClient(timeout=20,follow_redirects=False) as client:
            response = await client.get(helper.public_url(api,origin=True)+'/api/tracking/'+token)
        if response.status_code == 404:
            return {'ok':False,'message':'Запрос ещё не подготовлен в студии или история уже удалена.'}
        response.raise_for_status()
        data = response.json()
        return {'ok':True,'message':'Статус отправки через веб-студию.',
                **clean({key:data.get(key) for key in ('id','status','permalink','updatedAt')})}
    except (ValueError,OSError,httpx.HTTPError):
        return {'ok':False,'message':'Не удалось проверить отправку. Проверьте ID запроса и доступность студии.'}
