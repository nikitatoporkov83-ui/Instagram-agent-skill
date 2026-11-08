#!/usr/bin/env python3
"""Prepare a Reel for owner approval and read its status; never publish directly.

Provider tokens are read only from protected environment bindings. A shared
request grants no Instagram access: the studio still requires official login
and explicit approval. Its tracking token can read only that job's status.
"""

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import string
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://nikitatoporkov83-ui.github.io/Instagram-agent-skill/'
APIFY = 'https://api.apify.com/v2'
TOKEN = re.compile(r'[A-Za-z0-9_-]{43}\Z')


class UserError(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def public_url(value, *, origin=False):
    """Match the server's public media/origin boundary before any network call."""
    try:
        u = urlsplit(value)
        host = (u.hostname or '').lower()
        if (u.scheme != 'https' or u.username or u.password or u.fragment
                or u.port not in (None, 443) or '.' not in host or ':' in host
                or re.fullmatch(r'(?:\d+\.){3}\d+', host)
                or re.search(r'(?:^|\.)(?:localhost|local|internal)$', host)
                or len(value) > 3000):
            raise UserError()
        if origin and (u.path not in ('', '/') or u.query):
            raise UserError()
    except (ValueError, TypeError, AttributeError):
        raise UserError('Нужен публичный HTTPS-адрес без пароля и локальных адресов.') from None
    return f'https://{u.netloc}' if origin else value


def make_request(media_url, caption):
    if not isinstance(caption, str) or len(caption) > 2200:
        raise UserError('Подпись должна быть не длиннее 2 200 символов.')
    return {'version': 1, 'type': 'REELS', 'mediaUrl': public_url(media_url),
            'caption': caption.strip(), 'clientRequestId': secrets.token_urlsafe(32),
            'trackingToken': secrets.token_urlsafe(32), 'createdAt': int(time.time())}


def record_signature(key, signing_key):
    number = int(hmac.new(signing_key.encode(), key.encode(), hashlib.sha256).hexdigest()[:30], 16)
    alphabet, result = string.digits + string.ascii_letters, ''
    while number:
        number, remainder = divmod(number, 62)
        result = alphabet[remainder] + result
    return result or '0'


def apify(path, method='GET', data=None, content_type='application/json'):
    token = os.environ.get('APIFY_API_TOKEN')
    if not token:
        raise UserError('Для защищённой ссылки настройте APIFY_API_TOKEN в секретах среды.')
    if not path.startswith('/') or path.startswith('//'):
        raise UserError('Недопустимый путь Apify.')
    encoded = data if isinstance(data, bytes) else (json.dumps(data).encode() if data is not None else None)
    req = Request(APIFY + path, data=encoded, method=method,
                  headers={'Authorization': 'Bearer ' + token, 'Content-Type': content_type})
    try:
        with build_opener(NoRedirect()).open(req, timeout=45) as response:
            raw = response.read(131072)
            return json.loads(raw) if raw else {}
    except HTTPError as error:
        raise UserError(f'Apify отклонил запрос: HTTP {error.code}.') from None
    except (URLError, TimeoutError):
        raise UserError('Не удалось связаться с Apify. Запрос на публикацию не отправлен.') from None


def share_request(data):
    # One private store per request. Sharing is scoped to this single record;
    # the account API token and store signing key never leave this process.
    store = apify('/key-value-stores', 'POST', {'name': 'insta-request-' + data['clientRequestId'][:20]})['data']
    store_id = store['id']
    if not re.fullmatch(r'[A-Za-z0-9]+', store_id):
        raise UserError('Apify вернул некорректный ID хранилища.')
    apify('/key-value-stores/' + store_id, 'PUT', {'generalAccess': 'RESTRICTED'})
    metadata = apify('/key-value-stores/' + store_id)['data']
    if metadata.get('generalAccess') != 'RESTRICTED' or not metadata.get('urlSigningSecretKey'):
        raise UserError('Не удалось подготовить закрытое хранилище.')
    key = 'publication-' + data['clientRequestId'] + '.json'
    path = '/key-value-stores/' + store_id + '/records/' + quote(key, safe='')
    apify(path, 'PUT', data)
    signature = record_signature(key, metadata['urlSigningSecretKey'])
    return APIFY + path + '?' + urlencode({'signature': signature})


def configured_api():
    text = (ROOT / 'web/integration-config.js').read_text()
    match = re.search(r"instagramApiUrl\s*:\s*['\"]([^'\"]*)['\"]", text)
    return public_url(match[1], origin=True) if match and match[1] else None


def output_folder(value):
    folder = Path(value).resolve()
    if not any(folder.is_relative_to(ROOT / allowed) for allowed in ('.instagram', 'artifacts')):
        raise UserError('Сохраняйте запросы в исключённых из Git папках artifacts/ или .instagram/.')
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def prepare(args):
    folder = output_folder(args.output)
    caption = Path(args.caption_file).read_text(encoding='utf-8')
    data = make_request(args.media_url, caption)
    site = args.site_url
    u = urlsplit(public_url(site))
    if u.query or u.fragment:
        raise UserError('Адрес студии не должен содержать параметры или фрагмент.')
    api = public_url(args.api_url, origin=True) if args.api_url else configured_api()
    request_file = folder / ('publication-' + data['clientRequestId'] + '.json')
    request_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    record = share_request(data) if args.share else None
    job = {'version': 1, 'clientRequestId': data['clientRequestId'], 'trackingToken': data['trackingToken'],
           'apiUrl': api, 'requestFile': str(request_file),
           'approvalUrl': site + '?' + urlencode({'publish_request': record}) + '#instagram' if record else None}
    job_file = folder / ('job-' + data['clientRequestId'] + '.json')
    job_file.write_text(json.dumps(job, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'state': 'Ожидает проверки владельцем. В Instagram ничего не отправлено.',
                      'jobFile': str(job_file), 'requestFile': str(request_file), 'approvalUrl': job['approvalUrl'],
                      'serviceConfigured': bool(api)}, ensure_ascii=False, indent=2))


def status(args):
    job = json.loads(Path(args.job).read_text(encoding='utf-8'))
    token = job.get('trackingToken', '')
    if not isinstance(token, str) or not TOKEN.fullmatch(token):
        raise UserError('Некорректный файл отслеживания.')
    api = args.api_url or job.get('apiUrl') or configured_api()
    if not api:
        raise UserError('Сервис Instagram ещё не размещён. Сначала требуется его настройка.')
    url = public_url(api, origin=True) + '/api/tracking/' + token
    try:
        with build_opener(NoRedirect()).open(Request(url), timeout=25) as response:
            data = json.loads(response.read(16384))
    except HTTPError as error:
        if error.code == 404:
            print('Запрос ещё не подготовлен в студии или его история уже удалена.')
            return
        raise UserError(f'Проверка статуса недоступна: HTTP {error.code}.') from None
    except (URLError, TimeoutError):
        raise UserError('Сервис статусов недоступен. Повторная публикация не выполнялась.') from None
    # Allowlisted output only: no Meta/account credentials or publication body.
    print(json.dumps({key: data.get(key) for key in ('id', 'status', 'permalink', 'updatedAt')}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('prepare', help='Создать запрос, требующий подтверждения владельца')
    create.add_argument('--media-url', required=True)
    create.add_argument('--caption-file', required=True)
    create.add_argument('--site-url', default=SITE)
    create.add_argument('--api-url')
    create.add_argument('--output', default=str(ROOT / 'artifacts/instagram-requests'))
    create.add_argument('--share', action='store_true', help='Загрузить небольшой JSON-запрос в закрытое хранилище Apify')
    create.set_defaults(run=prepare)
    track = commands.add_parser('status', help='Прочитать статус одной отправки без доступа к аккаунту')
    track.add_argument('--job', required=True)
    track.add_argument('--api-url')
    track.set_defaults(run=status)
    args = parser.parse_args()
    try:
        args.run(args)
    except (ValueError, OSError, KeyError):
        # Known validation messages contain no provider response or secret.
        error = sys.exc_info()[1]
        print(str(error) if isinstance(error, UserError)
              else 'Не удалось прочитать или сохранить запрос. Проверьте файл и настройки.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
