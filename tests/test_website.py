"""Check meaningful browser-tool results against the canonical Python tools."""

import importlib.util
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class BrowserAlgorithmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hooks = load("reference_hook", "skills/ig-reel/hookscore.py")
        cls.beats = load("reference_beats", "skills/ig-reel/beats.py")
        cls.caption = load("reference_caption", "skills/ig-caption/caption.py")
        cls.human = load("reference_human", "skills/ig-human/humanize.py")
        cls.detect = load("reference_detect", "skills/ig-human/detect.py")
        cls.swipe = load("reference_swipe", "skills/ig-viral/swipe.py")
        cls.lexicon = json.loads((ROOT / "skills/ig-human/slop.json").read_text())

    def browser(self, tool, *args):
        result = subprocess.run(
            ["node", "scripts/check_engine.cjs"], cwd=ROOT, capture_output=True,
            input=json.dumps({"tool": tool, "args": args}), text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_hook_scores_match_original_examples_and_weak_hooks(self):
        cases = [h["example"] for h in json.loads((ROOT / "skills/ig-reel/hooks.json").read_text())["hooks"]]
        cases += ["Hey guys, today I wanted to talk about content strategy", "Stop scrolling if you want to grow in 2026 🔥", "", "I lost $18,000 on one missing contract."]
        for text in cases:
            with self.subTest(hook=text):
                checks, score, verdict, flags = self.hooks.run(text)
                result = self.browser("hook", text)
                self.assertAlmostEqual(result["score"], round(score, 1), places=1)
                self.assertEqual(result["verdict"], verdict)
                self.assertEqual(len(result["flags"]), len(flags))
                for name, (value, _) in checks.items():
                    self.assertAlmostEqual(result["checks"][name]["score"], value, places=1)

    def test_beats_match_original_durations_and_labels(self):
        script = "I lost $18,000 on one clause.\nYou can fix it in section 4.\nThat clause saved Dana $900.\n"
        for rate in (120, 165, 200):
            with self.subTest(rate=rate):
                expected = self.beats.analyse(script, wpm=rate, target=30)
                result = self.browser("beats", script, rate, 30)
                self.assertAlmostEqual(result["total_seconds"], expected["total_seconds"], places=2)
                self.assertEqual(result["total_words"], expected["total_words"])
                self.assertEqual([r["label"] for r in result["beats"]], [r["label"] for r in expected["beats"]])

    def test_caption_checks_and_verdict_match_original(self):
        cases = [
            "I lost $18,000 on one missing clause.\n\nMy client contract now says payment is due on delivery, with a date both sides can check before work starts. Save this.\n\n#contracts #freelance",
            "Hello world. #one #two #three #four #five #six",
            "x" * 2201,
            "See https://example.com/test. DM me and save this!",
        ]
        for text in cases:
            with self.subTest(caption=text[:40]):
                expected = self.caption.analyse(text, keywords=["client contract"])
                result = self.browser("caption", text, 125, ["client contract"])
                for key in ("characters", "visible", "hashtags", "mentions", "links", "emoji", "asks", "verdict"):
                    self.assertEqual(result[key], expected[key], key)
                self.assertEqual([c["status"] for c in result["checks"]], [c["status"] for c in expected["checks"]])

    def test_humanizer_matches_cleanup_and_protects_urls(self):
        cases = [
            'We\u200b delve into “growth”—then check https://example.com/leverage and hello@example.com.',
            "We leverage a robust system.\nIt is seamless…\n",
            "Stop scrolling. Let's face it, we delve into a game-changer.",
            "Привет\u200b, мир! «Это наш текст» — пример.",
            "we use normal lowercase text here.\nno changes needed.",
        ]
        for text in cases:
            with self.subTest(text=text):
                expected, report = self.human.humanize(text, self.lexicon)
                result = self.browser("humanize", text)
                self.assertEqual(result["text"], expected)
                for group in ("invisible", "typographic", "lexical"):
                    self.assertEqual(sum(x["count"] for x in result["report"][group]), sum(x["count"] for x in report[group]))

    def test_detector_scores_match_original(self):
        cases = [
            "We leverage robust seamless solutions. " * 10,
            "I lost $18,000 in June. I won't pay twice. You can copy my 4-line clause, but read it first because your job isn't mine, and your client might have a different plan. It saved Dana $900 on Friday. That's why I keep it. Your date goes in section 4.",
            "A short text.",
            "We\u200b delve into “growth”—and leverage a robust, seamless system. " * 5,
        ]
        for text in cases:
            with self.subTest(text=text[:40]):
                checks, score, verdict = self.detect.run(text, self.lexicon)
                result = self.browser("detect", text)
                self.assertAlmostEqual(result["human_score"], round(score, 1), delta=0.1)
                self.assertEqual(result["verdict"], verdict)
                for name, (value, _) in checks.items():
                    self.assertAlmostEqual(result["checks"][name]["score"], round(value, 1), delta=0.1)

    def test_swipe_ranking_formula_and_scores_match_original(self):
        rows = [
            {"account": "@a", "followers": 4000, "median": 1000, "views": 60000, "hook": "Nobody tells you that your first 30 reels are supposed to flop."},
            {"account": "@b", "followers": 2000000, "median": 900000, "views": 1200000, "hook": "In this video I show you my morning routine."},
            {"account": "@c", "followers": 48000, "median": 11000, "views": 412500, "hook": "Steal this four-line follow-up."},
        ]
        tsv = "account\tfollowers\tmedian\tviews\thook\n" + "\n".join("\t".join(str(r[k]) for k in ("account", "followers", "median", "views", "hook")) for r in rows)
        formulas = self.swipe.load_formulas(str(ROOT / "skills/ig-reel/hooks.json"))
        expected = self.swipe.analyse(rows, formulas)
        actual = self.browser("swipe", tsv)
        self.assertEqual(actual["baseline"], expected["baseline"])
        for result, reference in zip(actual["reels"], expected["reels"]):
            for key in ("account", "outlier", "formula_id", "hook_score", "baseline"):
                self.assertEqual(result[key], reference[key], key)

    def test_generated_assets_and_standalone_preview_exist(self):
        data = (ROOT / "web/data.js").read_text(encoding="utf-8")
        self.assertIn("ig-reel", data)
        html = (ROOT / "dist/instagram-studio.html").read_text(encoding="utf-8")
        self.assertNotIn('src="app.js"', html)
        self.assertNotIn('href="styles.css"', html)
        self.assertIn("globalThis.IG_ENGINE", html)
        self.assertIn("<html lang=\"ru\">", html)
