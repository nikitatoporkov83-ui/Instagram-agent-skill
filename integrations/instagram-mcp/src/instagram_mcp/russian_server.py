"""The studio's Russian MCP entry point. Never expose upstream write functions raw."""
from __future__ import annotations

import functools
import inspect
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from . import server as native
from .actions import ActionError, Journal
from .russian import DESCRIPTIONS, INSTRUCTIONS, PARAMETERS, WRITES, result_ru
from .studio import get_studio_request_status, prepare_studio_reel
from .tools import auth, comments, discovery, hashtags, insights, media, messaging, publish

mcp = FastMCP('instagram-studio-ru', instructions=INSTRUCTIONS, log_level='WARNING')
OPERATIONS: dict[str,Any] = {}


def journal() -> Journal:
    folder = os.getenv('INSTAGRAM_DATA_DIR') or str(Path(__file__).resolve().parents[2]/'.instagram')
    return Journal(folder)


def validate_arguments(arguments: dict):
    for field in ('message','caption'):
        value = arguments.get(field)
        if value is not None and (not isinstance(value,str) or len(value)>2200):
            raise ActionError('Текст должен быть не длиннее 2 200 символов.')
    if 'message' in arguments and not arguments['message'].strip():
        raise ActionError('Введите непустой текст ответа.')
    for key, value in arguments.items():
        if key in ('image_url','video_url','cover_url') and value:
            try:
                u = urlsplit(value)
                host = u.hostname or ''
                if (u.scheme!='https' or u.username or u.password or u.fragment or u.port not in (None,443)
                        or '.' not in host or ':' in host or host.replace('.','').isdigit()
                        or host.endswith(('.local','.internal','.localhost'))):
                    raise ValueError()
            except (ValueError,TypeError):
                raise ActionError('Нужна публичная HTTPS-ссылка непосредственно на медиафайл.') from None
        elif key == 'items' and isinstance(value,list):
            if not 2 <= len(value) <= 10:
                raise ActionError('Карусель должна содержать от 2 до 10 элементов.')
            for item in value:
                if not isinstance(item,dict):
                    raise ActionError('Некорректный элемент карусели.')
                validate_arguments(item)


async def account() -> dict:
    profile = await native.get_client().get('me',params={'fields':'id,username'})
    if not profile.get('id') or not isinstance(profile.get('username'),str):
        raise ActionError('Instagram не подтвердил аккаунт. Выполните официальный вход заново.')
    return profile


def wrap(function):
    @functools.wraps(function)
    async def call(*args,**kwargs):
        try:
            if function.__name__ in WRITES:
                bound = inspect.signature(function).bind(*args,**kwargs)
                bound.apply_defaults()
                arguments = dict(bound.arguments)
                validate_arguments(arguments)
                return journal().prepare(function.__name__,arguments,await account())
            return result_ru(await function(*args,**kwargs))
        except ActionError as error:
            return {'ok':False,'message':str(error)}
        except Exception as error:
            return result_ru(native.format_error(error))
    call.__signature__ = inspect.signature(function,eval_str=True)
    return call


for module in (auth,media,publish,comments,insights,discovery,hashtags,messaging):
    for name,function in inspect.getmembers(module,inspect.iscoroutinefunction):
        if name not in DESCRIPTIONS:
            continue
        if module is messaging and os.getenv('INSTAGRAM_MCP_ENABLE_MESSAGES') != '1':
            continue
        # Keep discovery available with an actionable Russian error when no FB
        # token is set. It never substitutes an Instagram token for a FB token.
        OPERATIONS[name] = function
        mcp.add_tool(wrap(function),name=name,description=DESCRIPTIONS[name],
                     annotations=ToolAnnotations(readOnlyHint=name not in WRITES,
                                                 destructiveHint=False,openWorldHint=name not in WRITES))


@mcp.tool(description='Проверить наличие настроек помощника, не выполняя вход и не раскрывая токен.')
async def connection_status() -> dict[str,Any]:
    mode = os.getenv('INSTAGRAM_LOGIN_MODE','instagram').strip().lower()
    unified = mode == 'unified'
    return {'ok':True,'language':'ru','token_configured':bool(os.getenv('INSTAGRAM_ACCESS_TOKEN')),
            'login_mode':mode if mode in ('instagram','unified') else 'invalid',
            'api_host':'graph.facebook.com' if unified else 'graph.instagram.com',
            'instagram_account_id_configured':bool(os.getenv('INSTAGRAM_IG_USER_ID')),
            'message':'Наличие токена не подтверждает подключение. Выполните validate_access_token.',
            'scopes':['instagram_basic','instagram_content_publish','instagram_manage_comments'] if unified
                     else ['instagram_business_basic','instagram_business_content_publish','instagram_business_manage_comments']}


@mcp.tool(description='Выполнить подготовленное действие только после явного согласия владельца с аккаунтом, материалом и точным текстом. Код действует 10 минут; повтор не создаёт дубль.')
async def confirm_action(request_id: str, confirmation_code: str) -> dict[str,Any]:
    try:
        log = journal()
        row = log.verify(request_id,confirmation_code)
        if row['status'] != 'prepared':
            return log.get(request_id)
        current = await account()
        if str(current['id']) != row['account_id']:
            raise ActionError('Подключён другой аккаунт. Подготовьте новый предпросмотр для него.')
        if not log.claim(request_id):
            return log.get(request_id)
        import json
        try:
            value = result_ru(await OPERATIONS[row['tool']](**json.loads(row['arguments'])))
            if value.get('ok') and value.get('media_id'):
                try:
                    details = await native.get_client().get(str(value['media_id']),params={'fields':'permalink'})
                    link = details.get('permalink','')
                    if link.startswith(('https://www.instagram.com/','https://instagram.com/')):
                        value['permalink'] = link
                except Exception:
                    pass
            log.finish(request_id,value)
        except Exception as error:
            log.finish(request_id,result_ru(native.format_error(error)))
        return log.get(request_id)
    except ActionError as error:
        return {'ok':False,'message':str(error)}
    except Exception as error:
        return result_ru(native.format_error(error))


@mcp.tool(description='Отменить подготовленное действие. Уже отправленная публикация или ответ этим инструментом не удаляются.')
async def cancel_action(request_id: str) -> dict[str,Any]:
    try:
        return journal().cancel(request_id)
    except ActionError as error:
        return {'ok':False,'message':str(error)}


@mcp.tool(description='Посмотреть статус одной отправки: предпросмотр, выполнение, успех, отмена или неопределённый результат.')
async def get_action_status(request_id: str) -> dict[str,Any]:
    try:
        return journal().get(request_id)
    except ActionError as error:
        return {'ok':False,'message':str(error)}


@mcp.tool(description='Показать журнал последних действий помощника за 30 дней. Временные отметки возвращаются как Unix time; показывайте их владельцу по Москве.')
async def get_action_history(limit: int = 20) -> dict[str,Any]:
    return {'ok':True,'message':'История действий помощника.','actions':journal().history(limit)}


@mcp.prompt(name='instagram_assistant_ru',description='Инструкции русскоязычного помощника по публикациям и комментариям insta.studio.')
def instagram_assistant_ru(task: str = '') -> str:
    return INSTRUCTIONS + '\nЗадача владельца:\n' + task


mcp.add_tool(prepare_studio_reel,description='Передать Reels в очередь нашего сайта для предпросмотра и подтверждения владельцем. Не отправляет ролик в Instagram.')
mcp.add_tool(get_studio_request_status,description='Проверить отправку через веб-студию по ID запроса. Читает только статус одной публикации.')

# Add Russian parameter explanations to the public JSON schema.
for tool in mcp._tool_manager.list_tools():
    for name, schema in tool.parameters.get('properties',{}).items():
        schema['description'] = PARAMETERS.get(name,f'Параметр «{name}»; технический формат Instagram API сохраняется.')
