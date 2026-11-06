#!/usr/bin/env python3
"""Exercise actual navigation, sandbox previews and interrupted legacy loads."""
from functools import partial
from html import escape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from shutil import which
from threading import Thread
from playwright.sync_api import sync_playwright, expect
from build_site import SCRIPTS

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {
    'studio':'Студия контента', 'library':'13 способов', 'plan':'Неделя',
    'drafts':'Идеи, к которым', 'voice':'Ваш голос', 'instagram':'Ваш Instagram', 'overview':'Из Vice City',
}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        if path not in ('/legacy.html','/standalone.html','/preview.html'):
            return super().do_GET()
        if path == '/preview.html':
            # Use a real HTTP parent, like the Codex preview. Assigning srcdoc via
            # DevTools in an originless about:blank parent crashes some Chrome builds.
            origin = f'http://127.0.0.1:{self.server.server_port}'
            document = (ROOT / 'web/index.html').read_text().replace(
                '<head>',f'<head><base href="{origin}/">',1)
            html = ('<!doctype html><html><head><title>Studio preview fixture</title></head>'
                    '<body><iframe title="Studio preview" sandbox="allow-scripts" '
                    'style="width:1400px;height:950px;border:0" '
                    f'srcdoc="{escape(document,quote=True)}"></iframe></body></html>')
        elif path == '/standalone.html':
            html = (ROOT / 'dist/instagram-studio.html').read_text()
        else:
            # A cached older document can still request the individual source files.
            html = (ROOT / 'web/index.html').read_text()
            tags = '\n'.join(f'<script src="{name}" defer></script>' for name in SCRIPTS)
            html = re.sub(r'<script[^>]+data-site-bundle></script>',lambda match:tags,html)
        content = html.encode()
        self.send_response(200)
        self.send_header('Content-Type','text/html;charset=utf-8')
        self.send_header('Content-Length',str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def end_headers(self):
        # Public static assets may be loaded by an opaque-origin srcdoc preview.
        self.send_header('Access-Control-Allow-Origin','*')
        super().end_headers()


def check_routes(page,mobile=False):
    for route,title in ROUTES.items():
        if mobile:
            page.locator('#menu-toggle').click()
            expect(page.locator('#menu-toggle')).to_have_attribute('aria-expanded','true')
        page.locator(f'[data-nav="{route}"]').click()
        expect(page.locator('#main h1')).to_contain_text(title)
        expect(page.locator(f'[data-nav="{route}"]')).to_have_attribute('aria-current','page')
        if mobile:
            expect(page.locator('#menu-toggle')).to_have_attribute('aria-expanded','false')


def check_home_actions(page):
    page.locator('.hero [data-route="studio"]').click()
    expect(page.locator('#tool-text')).to_be_visible()
    page.locator('[data-nav="overview"]').click()
    page.locator('.hero [data-route="library"]').click()
    expect(page.locator('.skill-card')).to_have_count(13)
    page.locator('[data-nav="overview"]').click()
    page.locator('.next-stop').click()
    expect(page.locator('.planner-day')).to_have_count(7)
    page.locator('.brand').click()
    expect(page.locator('#main h1')).to_contain_text('Из Vice City')


def main():
    server = ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT / 'web')))
    Thread(target=server.serve_forever,daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    errors = []
    try:
        with sync_playwright() as p:
            browser_path = next((path for name in ('chromium','google-chrome','google-chrome-stable') if (path := which(name))),None)
            options = {'executable_path':browser_path} if browser_path else {}
            print('Browser:',browser_path or 'Playwright Chromium',flush=True)
            browser = p.chromium.launch(headless=True,args=['--disable-gpu'],**options)
            context = browser.new_context(viewport={'width':1440,'height':1000})
            page = context.new_page()
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(origin,wait_until='networkidle')
            check_routes(page)
            check_home_actions(page)
            print('PASS: All seven navigation sections, primary hero actions, weekly-plan shortcut and brand link.')

            for skill in ['ig-reel','ig-caption','ig-human','ig-viral','ig-plan','ig-carousel','ig-story','ig-profile','ig-comment','ig-reply','ig-dm','ig-repurpose','ig-audit']:
                page.locator('[data-nav="library"]').click()
                page.locator(f'.skill-card[data-skill="{skill}"]').click()
                if skill in ('ig-reel','ig-caption','ig-human','ig-viral'):
                    expect(page.locator('#tool-text')).to_be_visible()
                elif skill == 'ig-plan':
                    expect(page.locator('.planner-day')).to_have_count(7)
                else:
                    expect(page.locator('#dialog')).to_be_visible()
                    expect(page.locator('#brief-context')).to_be_visible()
                    page.keyboard.press('Escape')
            print('PASS: Each of the 13 library cards opens its editor, planner or brief.')

            page.locator('[data-nav="overview"]').click()
            page.locator('.hero [data-route="studio"]').click()
            page.locator('[data-nav="library"]').click()
            page.locator('[data-nav="plan"]').click()
            page.go_back(); expect(page.locator('#main h1')).to_contain_text('13 способов')
            page.go_back(); expect(page.locator('#main h1')).to_contain_text('Студия контента')
            page.go_forward(); expect(page.locator('#main h1')).to_contain_text('13 способов')
            context.close()
            print('PASS: Browser Back and Forward preserve page navigation.')

            for width in (320,390):
                context = browser.new_context(viewport={'width':width,'height':844},is_mobile=True,has_touch=True)
                phone = context.new_page()
                phone.on('pageerror',lambda error:errors.append(str(error)))
                phone.goto(origin,wait_until='networkidle')
                check_routes(phone,mobile=True)
                phone.locator('.hero [data-route="studio"]').click()
                expect(phone.locator('#tool-text')).to_be_visible()
                assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
                context.close()
            print('PASS: Real drawer and primary-button clicks at 320px and 390px.')

            context = browser.new_context(viewport={'width':1440,'height':1000})
            context.add_init_script("""
                history.pushState = () => { throw new DOMException('Preview has no history access','SecurityError'); };
                window.addEventListener('hashchange',event => event.stopImmediatePropagation());
            """)
            preview = context.new_page()
            preview.on('pageerror',lambda error:errors.append(str(error)))
            preview.goto(origin,wait_until='networkidle')
            check_routes(preview)
            check_home_actions(preview)
            context.close()
            print('PASS: Menus and CTAs work when the preview blocks History API and hash events.')

            wrapper = browser.new_page(viewport={'width':1440,'height':1000})
            wrapper.on('pageerror',lambda error:errors.append(str(error)))
            wrapper.goto(origin+'/preview.html',wait_until='networkidle')
            frame = wrapper.frame_locator('iframe')
            expect(frame.locator('.hero')).to_be_visible()
            check_routes(frame)
            check_home_actions(frame)
            wrapper.close()
            print('PASS: Published files inside a sandboxed srcdoc preview stay inside the app.')

            context = browser.new_context(viewport={'width':1440,'height':1000})
            standalone = context.new_page()
            standalone.on('pageerror',lambda error:errors.append(str(error)))
            standalone.goto(origin+'/standalone.html',wait_until='networkidle')
            context.set_offline(True)
            check_routes(standalone)
            check_home_actions(standalone)
            context.close()
            print('PASS: The complete standalone artifact keeps navigation and CTAs working offline.')

            context = browser.new_context(viewport={'width':1440,'height':1000})
            recovery = context.new_page()
            recovery.on('pageerror',lambda error:errors.append(str(error)))
            attempts = 0
            def fail_once(route):
                nonlocal attempts
                attempts += 1
                if attempts == 1: route.abort()
                else: route.continue_()
            recovery.route('**/studio.js?*',fail_once)
            recovery.goto(origin,wait_until='networkidle')
            expect(recovery.locator('.startup-message')).to_be_visible()
            recovery.locator('[data-studio-reload]').click()
            expect(recovery.locator('.hero')).to_be_visible()
            recovery.locator('.hero [data-route="studio"]').click()
            expect(recovery.locator('#tool-text')).to_be_visible()
            assert attempts == 2
            context.close()
            print('PASS: A failed application download offers a working reload link and recovers the buttons.')

            for missing in ('apify.js','apify-data.js','instagram.js'):
                context = browser.new_context(viewport={'width':1440,'height':1000})
                legacy = context.new_page()
                legacy.on('pageerror',lambda error:errors.append(str(error)))
                legacy.route('**/'+missing,lambda route:route.abort())
                legacy.goto(origin+'/legacy.html',wait_until='networkidle')
                check_home_actions(legacy)
                for route,title in [('studio','Студия контента'),('library','13 способов'),('plan','Неделя')]:
                    legacy.locator(f'[data-nav="{route}"]').click()
                    expect(legacy.locator('#main h1')).to_contain_text(title)
                if missing == 'instagram.js':
                    legacy.locator('[data-nav="instagram"]').click()
                    expect(legacy.locator('#main')).to_contain_text('Повторить загрузку')
                else:
                    legacy.locator('[data-nav="studio"]').click(); legacy.locator('[data-tool="swipe"]').click()
                    expect(legacy.locator('#apify-root')).to_contain_text('Повторить загрузку')
                    legacy.locator('[data-action="analyze"]').click()
                    expect(legacy.locator('#tool-result tbody tr')).to_have_count(3)
                context.close()
            print('PASS: A failed optional script in a cached legacy page cannot disable menus, CTAs or local tools.')
            browser.close()
        assert not errors,'JavaScript errors: '+repr(errors)
        print('Navigation regression checks passed. JavaScript errors: 0.')
    finally:
        server.shutdown(); server.server_close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Keep the useful failure visible in public Actions annotations too.
        details = str(error).split('Call log:')[0]
        fatal = [line for line in details.splitlines()
                 if re.search(r':FATAL:|Check failed|CHECK failed|Received signal|SIG(?:SEGV|ABRT)',line)]
        message = (details.splitlines()[0]+'\n'+'\n'.join(fatal)+'\n'+details[-1000:]) if fatal else details
        message = message[:2000]
        message = message.replace('%','%25').replace('\r','%0D').replace('\n','%0A')
        print('::error title=Browser navigation check::'+message,flush=True)
        raise
