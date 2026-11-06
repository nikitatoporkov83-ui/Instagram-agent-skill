#!/usr/bin/env python3
"""Test Apify imports in the browser using marked fixtures; no live collection."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def main():
    server = ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(ROOT / "web")))
    Thread(target=server.serve_forever,daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    errors = []
    rows = [{"type":"Video","shortCode":f"GTATEST{i:03d}","ownerUsername":f"test_creator_{i}",
             "caption":"Nobody tells you that your first 3 GTA VI breakdowns need work.\n#GTA6",
             "videoViewCount":1000+i,"ownerFollowersCount":100,"likesCount":i} for i in range(22)]
    rows.append({"type":"Video","shortCode":"GTAXSS001","ownerUsername":"test_creator_xss",
                 "caption":'<img src=x onerror="window.__apify_xss=1">',"videoViewCount":12})
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
            page = browser.new_page(viewport={"width":1440,"height":1100})
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(origin,wait_until='networkidle')
            page.locator('[data-nav="studio"]').click()
            page.locator('[data-tool="swipe"]').click()
            expect(page.locator('[data-apify-action="load"]')).to_be_disabled()
            page.locator('#apify-file').set_input_files({"name":"fixture.json","mimeType":"application/json","buffer":json.dumps(rows).encode()})
            expect(page.locator('.apify-reel')).to_have_count(23)
            expect(page.locator('.apify-reel img')).to_have_count(0)
            assert page.evaluate('window.__apify_xss') is None
            checks = page.locator('[data-apify-select]')
            for index in range(20): checks.nth(index).check()
            checks.nth(20).click()
            expect(page.locator('#apify-selected-count')).to_have_text('20')
            expect(checks.nth(20)).not_to_be_checked()
            with page.expect_download() as event:
                page.locator('[data-apify-action="export"]').click()
            text = Path(event.value.path()).read_text()
            assert text.count('## ') == 20 and 'видео-хук требует просмотра' in text
            page.locator('[data-apify-action="swipe"]').click()
            expect(page.locator('#tool-result tbody tr')).to_have_count(20)
            for width in (320,390):
                page.set_viewport_size({"width":width,"height":844})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#apify-file').set_input_files({"name":"bad.json","mimeType":"application/json","buffer":b'invalid'})
            expect(page.locator('#apify-root .error-message')).to_contain_text('Не удалось прочитать JSON')
            print('PASS: Local JSON import, 20-selection cap, real Markdown export, TSV bridge, XSS escaping and mobile widths.')
            page.close()

            api = 'https://apify-api.example'
            context = browser.new_context()
            context.add_init_script(f"globalThis.IG_CONFIG={{apifyApiUrl:{json.dumps(api)}}}")
            calls = []
            def handler(route):
                request = route.request
                headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}
                if request.method == 'OPTIONS': route.fulfill(status=204,headers=headers); return
                if request.url.endswith('/status'): route.fulfill(json={'configured':True,'maxItems':100},headers=headers); return
                calls.append(request)
                route.fulfill(json={'rows':[{'id':'GTAREMOTE1','account':'@test_remote','url':'https://www.instagram.com/reel/GTAREMOTE1/','caption':'Test fixture','captionFirstLine':'Test fixture','views':42,'likes':None,'comments':None,'followers':None,'median':None,'videoUrl':None,'thumbnailUrl':None,'postedAt':None}]},headers=headers)
            context.route(api+'/**',handler)
            remote = context.new_page()
            remote.on('pageerror',lambda error:errors.append(str(error)))
            remote.goto(origin,wait_until='networkidle')
            remote.locator('[data-nav="studio"]').click(); remote.locator('[data-tool="swipe"]').click()
            expect(remote.locator('[data-apify-action="load"]')).to_be_enabled()
            remote.locator('#apify-source').fill('https://console.apify.com/storage/datasets/Fixture123')
            remote.locator('#apify-access').fill('test-only-browser-access-key-not-provider-token')
            remote.locator('[data-apify-action="load"]').click()
            expect(remote.locator('.apify-reel')).to_have_count(1)
            assert len(calls) == 1
            assert calls[0].post_data_json['source'] == {'kind':'dataset','id':'Fixture123'}
            assert calls[0].headers['authorization'] == 'Bearer test-only-browser-access-key-not-provider-token'
            assert 'test-only-browser-access-key' not in remote.evaluate('JSON.stringify(localStorage)')
            expect(remote.locator('#apify-access')).to_have_value('')
            remote.locator('[data-apify-action="swipe"]').click()
            expect(remote.locator('#apify-root .error-message')).to_contain_text('Этих данных в выгрузке нет')
            print('PASS: Remote import stays on the configured service; studio code is not persisted; missing baselines are reported.')
            context.close(); browser.close()
        assert not errors,errors
        print('Apify browser checks passed. Fixtures only; no real account or paid Actor run.')
    finally:
        server.shutdown(); server.server_close()


if __name__ == '__main__':
    main()
