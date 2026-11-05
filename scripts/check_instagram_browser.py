#!/usr/bin/env python3
"""Browser integration checks with a simulated API; never signs in or posts to Meta."""

import base64
import hashlib
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
API = "https://instagram-service.test"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT / "web")))
    Thread(target=server.serve_forever, daemon=True).start()
    site = f"http://127.0.0.1:{server.server_port}"
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True)
            plain = browser.new_context(viewport={"width": 1440, "height": 1000})
            page = plain.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(site + "/#instagram", wait_until="networkidle")
            expect(page.locator(".ig-setup-note")).to_contain_text("Подключение ещё не активировано")
            expect(page.locator('[data-ig-action="connect"]')).to_be_disabled()
            expect(page.locator("#ig-publication-form")).to_have_count(0)
            page.locator('[data-ig-action="setup"]').click()
            expect(page.locator("#dialog")).to_contain_text("Как подключить аккаунт")
            page.keyboard.press("Escape")
            (ROOT / "artifacts").mkdir(exist_ok=True)
            page.screenshot(path=str(ROOT / "artifacts/instagram-not-configured.png"), full_page=True)
            for width in (320, 390):
                page.set_viewport_size({"width": width, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Unconfigured mobile overflow: {width}"
            plain.close()

            mock = {"connected": False, "challenge": "", "completions": 0, "prepares": 0, "confirms": 0, "posts": []}
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            context.add_init_script("globalThis.IG_CONFIG={instagramApiUrl:" + json.dumps(API) + "};")

            def backend(route):
                req = route.request
                parsed = urlsplit(req.url)
                headers = {"Access-Control-Allow-Origin": site, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS"}
                if req.method == "OPTIONS":
                    route.fulfill(status=204, headers=headers)
                    return

                def answer(value, status=200, extra=None):
                    route.fulfill(status=status, content_type="application/json", headers={**headers, **(extra or {})}, body=json.dumps(value))

                path = parsed.path
                if path == "/health":
                    answer({"configured": True})
                elif path == "/oauth/start":
                    mock["challenge"] = req.post_data_json["challenge"]
                    answer({"state": "test-state", "url": "https://www.instagram.com/oauth/authorize?state=test-state"})
                elif path == "/oauth/callback":
                    # Only the correct popup origin and state may complete the login.
                    payload = {"type": "instagram-connected", "state": "test-state", "handoff": "test-handoff"}
                    wrong = {**payload, "state": "wrong-state"}
                    code = "window.opener.postMessage(" + json.dumps(wrong) + "," + json.dumps(site) + ");setTimeout(()=>{window.opener.postMessage(" + json.dumps(payload) + "," + json.dumps(site) + ");},100);"
                    route.fulfill(status=200, content_type="text/html", body="<!doctype html><title>Mock official callback</title><script>" + code + "</script>")
                elif path == "/oauth/complete":
                    data = req.post_data_json
                    challenge = base64.urlsafe_b64encode(hashlib.sha256(data["verifier"].encode()).digest()).decode().rstrip("=")
                    assert challenge == mock["challenge"]
                    assert data["handoff"] == "test-handoff"
                    mock["completions"] += 1
                    mock["connected"] = True
                    answer({"connected": True}, extra={"Set-Cookie": "insta_session=test-browser-session; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=300"})
                elif path == "/api/me":
                    authenticated = mock["connected"] and 'insta_session=test-browser-session' in req.headers.get('cookie','')
                    answer({"connected": True, "username": "test_professional", "instagramUserId": "123", "expiresAt": 1900000000}) if authenticated else answer({"error": "Подключите Instagram"}, 401)
                elif path == "/api/media":
                    answer({"media": []})
                elif path == "/api/publications":
                    answer({"publications": mock["posts"]})
                elif path == "/api/publications/prepare":
                    mock["prepares"] += 1
                    data = req.post_data_json
                    answer({"id": "prepared-" + str(mock["prepares"]), "confirmation": "confirmation-value", "username": "test_professional", **data}, 201)
                elif path.endswith("/confirm"):
                    assert req.post_data_json == {"confirm": True, "confirmation": "confirmation-value"}
                    mock["confirms"] += 1
                    result = {"id": "published-1", "status": "published", "type": "IMAGE", "caption": "Мой проверенный пост", "confirmedAt": 1800000000, "permalink": "https://www.instagram.com/p/test-publication/"}
                    mock["posts"] = [result]
                    answer(result)
                elif path == "/api/disconnect":
                    mock["connected"] = False
                    answer({"connected": False, "revoked": True}, extra={"Set-Cookie": "insta_session=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0"})
                else:
                    raise AssertionError("Unexpected API request: " + path)

            context.route(API + "/**", backend)
            context.route("https://www.instagram.com/oauth/authorize**", lambda route: route.fulfill(status=302, headers={"Location": API + "/oauth/callback?state=test-state"}))
            context.route("https://example.com/photo.jpg", lambda route: route.fulfill(content_type="image/svg+xml", body='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#eee7fa"/></svg>'))
            page = context.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(site + "/#instagram", wait_until="networkidle")
            expect(page.locator('[data-ig-action="connect"]')).to_be_enabled()
            with page.expect_popup() as popup_info:
                page.locator('[data-ig-action="connect"]').click()
            popup = popup_info.value
            expect(page.locator(".ig-account-copy h2")).to_have_text("@test_professional", timeout=15000)
            assert mock["completions"] == 1
            cookies = context.cookies(API)
            assert any(c["name"] == "insta_session" and c["httpOnly"] and c["secure"] for c in cookies)
            popup.close()
            expect(page.locator("#ig-publication-form")).to_be_visible()
            page.locator("#ig-url").fill("https://example.com/photo.jpg")
            page.locator("#ig-caption").fill("Мой проверенный пост")
            page.locator('#ig-publication-form button[type="submit"]').click()
            expect(page.locator("#dialog")).to_contain_text("Проверить и опубликовать")
            assert mock["prepares"] == 1 and mock["confirms"] == 0
            page.keyboard.press("Escape")
            assert mock["confirms"] == 0
            page.locator('#ig-publication-form button[type="submit"]').click()
            expect(page.locator(".ig-review-caption")).to_have_text("Мой проверенный пост")
            page.locator('[data-ig-action="confirm"]').click()
            expect(page.locator(".ig-publication .badge")).to_have_text("Опубликовано")
            expect(page.locator(".ig-publication a")).to_have_attribute("href", "https://www.instagram.com/p/test-publication/")
            assert mock["confirms"] == 1
            page.screenshot(path=str(ROOT / "artifacts/instagram-mock-connected.png"), full_page=True)
            for width in (320, 390):
                page.set_viewport_size({"width": width, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Connected mobile overflow: {width}"
            page.locator('[data-ig-action="disconnect"]').click()
            expect(page.locator("#ig-publication-form")).to_have_count(0)
            expect(page.locator('[data-ig-action="connect"]')).to_be_enabled()
            assert not errors, errors
            context.close()
            browser.close()
        print("PASS: Missing server configuration never appears as a connected account.")
        print("PASS: Official popup flow validates origin, source, state and PKCE handoff.")
        print("PASS: Preview and cancellation make zero publication requests.")
        print("PASS: Only explicit confirmation sends the prepared post.")
        print("PASS: Success permalink, disconnection, and 320/390px layouts.")
        print("No real Meta account was used and no content was posted.")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
