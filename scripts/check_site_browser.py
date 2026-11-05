#!/usr/bin/env python3
"""Exercise the real website in Chromium; keep screenshots in ignored artifacts/."""

from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)
URL = "http://127.0.0.1:4173/"


def main():
    errors = []
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1100}, device_scale_factor=1)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL, wait_until="networkidle")
        expect(page.locator("h1")).to_contain_text("Ваш следующий")
        expect(page.locator("#overview-analysis .score-disc strong")).to_have_text("86")
        page.screenshot(path=str(ARTIFACTS / "instagram-studio-desktop.png"), full_page=True)
        page.locator("#overview-hook").fill("Hey guys, today I wanted to talk about content strategy")
        page.locator('[data-action="overview-analyze"]').click()
        assert int(page.locator("#overview-analysis .score-disc strong").inner_text()) < 50
        page.locator('[data-nav="library"]').click()
        page.locator('[data-nav="overview"]').click()
        assert int(page.locator("#overview-analysis .score-disc strong").inner_text()) < 50
        page.locator("#overview-hook").fill("Мой первый ролик")
        page.locator('[data-action="overview-analyze"]').click()
        expect(page.locator("#overview-analysis")).to_contain_text("рассчитан на английский")
        checks.append("Home: real hook score, weak-hook detection, Russian-language guard")

        page.locator('.hero [data-route="studio"]').click()
        page.locator('[data-action="analyze"]').click()
        expect(page.locator("#tool-result .score-disc strong")).to_have_text("86")
        page.locator('[data-action="formulas"]').click()
        expect(page.locator("#dialog")).to_be_visible()
        expect(page.locator(".formula-card")).to_have_count(26)
        page.locator('[data-formula="1"]').click()
        expect(page.locator("#tool-text")).to_contain_text("$18,000 is what one missing clause cost me.")
        page.locator('[data-action="save-draft"]').click()
        expect(page.locator("#draft-count")).to_have_text("1")
        page.locator('[data-nav="drafts"]').click()
        page.reload(wait_until="networkidle")
        expect(page.locator(".draft-card")).to_have_count(1)
        page.locator('[data-open-draft]').click()
        expect(page.locator("#tool-text")).to_have_value("$18,000 is what one missing clause cost me.")
        checks.append("Hook formulas: all 26; saving and reopening a draft survives reload")

        page.locator('[data-tool="beats"]').click()
        page.locator('[data-action="analyze"]').click()
        expect(page.locator(".beat-row")).to_have_count(8)
        expect(page.locator(".big-metric")).to_contain_text("секунд")
        page.locator("#wpm").fill("0")
        page.locator('[data-action="analyze"]').click()
        expect(page.locator("#tool-result .error-message")).to_contain_text("темп")
        checks.append("Beat sheet: real timing and invalid-rate handling")

        page.locator('[data-tool="caption"]').click()
        page.locator('[data-action="analyze"]').click()
        expect(page.locator("#tool-result .badge")).to_have_text("Готово")
        page.locator("#tool-text").fill(page.locator("#tool-text").input_value() + " #one #two #three #four")
        page.locator('[data-action="analyze"]').click()
        expect(page.locator("#tool-result .badge")).to_have_text("Нужны правки")
        checks.append("Caption: visible-window preview and six-hashtag rejection")

        page.locator('[data-tool="human"]').click()
        page.locator('[data-action="analyze"]').click()
        cleaned = page.locator("#clean-result").input_value()
        assert "\u200b" not in cleaned and "—" not in cleaned
        assert "https://example.com/leverage" in cleaned
        assert "leverage a robust" not in cleaned
        page.locator("#tool-text").fill("Привет\u200b, мир! Это наш текст — пример.")
        page.locator('[data-action="analyze"]').click()
        expect(page.locator("#clean-result")).to_have_value("Привет, мир! Это наш текст, пример.\n")
        expect(page.locator("#tool-result")).not_to_contain_text("Локальная оценка стиля")
        checks.append("Humanizer: cleanup, URL protection, honest handling of Russian text")

        page.locator('[data-tool="swipe"]').click()
        page.locator('[data-action="analyze"]').click()
        rows = page.locator("tbody tr")
        expect(rows).to_have_count(3)
        expect(rows.first).to_contain_text("@studio_a")
        expect(rows.first).to_contain_text("60×")
        with page.expect_download() as info:
            page.locator('[data-action="download-result"]').click()
        output = info.value
        assert output.suggested_filename.endswith(".md")
        assert "# Swipe file" in Path(output.path()).read_text()
        page.locator("#tool-text").fill("account\tfollowers\tmedian\tviews\thook\n@a\t4k\t1000\t60000\tHello there")
        page.locator('[data-action="analyze"]').click()
        expect(page.locator("#tool-result .error-message")).to_contain_text("целые числа")
        checks.append("Reel research: baseline-relative ranking, actual Markdown download, invalid-data error")

        page.locator('[data-nav="voice"]').click()
        page.locator("#voice-name").fill("Алексей")
        page.locator("#voice-handle").fill("@demo_creator")
        page.locator("#voice-audience").fill("Начинающие фотографы")
        page.locator('#voice-form button[type="submit"]').click()
        page.reload(wait_until="networkidle")
        expect(page.locator("#voice-name")).to_have_value("Алексей")
        expect(page.locator("#top-avatar")).to_have_text("А")
        checks.append("Voice profile: storage, reload and personalized avatar")

        page.locator('[data-nav="library"]').click()
        expect(page.locator(".skill-card")).to_have_count(13)
        page.locator('[data-filter="Общение"]').click()
        expect(page.locator(".skill-card")).to_have_count(3)
        page.locator('[data-filter="Все"]').click()
        page.locator("#skill-search").fill("Карусель")
        expect(page.locator(".skill-card")).to_have_count(1)
        page.locator(".skill-card").click()
        expect(page.locator("#brief-audience")).to_have_value("Начинающие фотографы")
        page.locator("#brief-context").fill("Покажи 5 способов найти первого клиента.")
        page.locator('#brief-form button[type="submit"]').click()
        brief = page.locator("#brief-result").input_value()
        assert "Покажи 5 способов" in brief and "# ig-carousel" in brief and "Начинающие фотографы" in brief
        page.keyboard.press("Escape")
        expect(page.locator("#dialog")).not_to_be_visible()
        checks.append("Library: all 13 skills, category and text filters; source-grounded brief with saved profile")

        page.locator('[data-nav="plan"]').click()
        page.locator('[data-plan-day="4"]').click()
        page.locator("#plan-title").fill("Первый клиент: мой опыт")
        page.locator('#plan-form button[type="submit"]').click()
        expect(page.locator(".plan-item")).to_have_count(1)
        page.locator('[data-toggle-plan]').click()
        expect(page.locator(".plan-item")).to_have_class("plan-item completed")
        page.reload(wait_until="networkidle")
        expect(page.locator(".plan-item")).to_have_count(1)
        page.locator('[data-delete-plan]').click()
        expect(page.locator(".plan-item")).to_have_count(0)
        page.locator('[data-action="sample-plan"]').click()
        expect(page.locator(".plan-item")).to_have_count(4)
        checks.append("Planner: creation, completion, persistence, deletion and optional sample week")

        page.locator('[data-nav="studio"]').click()
        page.locator('[data-tool="hooks"]').click()
        attack = '<img src=x onerror="window.__injected=true">'
        page.locator("#tool-text").fill(attack)
        page.locator('[data-action="save-draft"]').click()
        page.locator('[data-nav="drafts"]').click()
        expect(page.locator(".draft-card img")).to_have_count(0)
        assert page.evaluate("window.__injected") is None
        checks.append("User text is escaped in saved drafts")
        context.close()

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        phone = mobile.new_page()
        phone.on("pageerror", lambda error: errors.append(str(error)))
        phone.goto(URL, wait_until="networkidle")
        phone.screenshot(path=str(ARTIFACTS / "instagram-studio-mobile.png"), full_page=True)
        for view in ("overview", "studio", "library", "plan", "voice", "drafts"):
            phone.goto(URL + "#" + view, wait_until="networkidle")
            assert phone.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Mobile overflow in {view}"
        phone.locator("#menu-toggle").click()
        expect(phone.locator("#menu-toggle")).to_have_attribute("aria-expanded", "true")
        phone.locator('[data-nav="library"]').click()
        expect(phone.locator("h1")).to_contain_text("13 способов")
        expect(phone.locator("#menu-toggle")).to_have_attribute("aria-expanded", "false")
        mobile.close()
        checks.append("Mobile: all six pages fit 390px; drawer navigation works")

        # Managed Chromium blocks file:// by policy. Serve only the single-file
        # artifact locally, then disable networking to verify standalone behavior.
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT / "dist")))
        Thread(target=server.serve_forever, daemon=True).start()
        offline = browser.new_context(viewport={"width": 1440, "height": 1100})
        sample = offline.new_page()
        sample.on("pageerror", lambda error: errors.append(str(error)))
        sample.goto(f"http://127.0.0.1:{server.server_port}/instagram-studio.html", wait_until="load")
        offline.set_offline(True)
        expect(sample.locator("h1")).to_contain_text("Ваш следующий")
        sample.locator('[data-action="overview-analyze"]').click()
        expect(sample.locator("#overview-analysis .score-disc strong")).to_have_text("86")
        sample.locator('.hero [data-route="studio"]').click()
        sample.locator('[data-tool="human"]').click()
        sample.locator('[data-action="analyze"]').click()
        expect(sample.locator("#clean-result")).to_be_visible()
        offline.close()
        server.shutdown()
        server.server_close()
        checks.append("Single-file HTML: real interactions work with networking disabled after document load")
        browser.close()
    assert not errors, "JavaScript errors: " + repr(errors)
    for check in checks:
        print("PASS:", check)
    print(f"Browser checks completed: {len(checks)}. JavaScript errors: {len(errors)}.")
    print("Desktop/mobile screenshots: artifacts/")


if __name__ == "__main__":
    main()
