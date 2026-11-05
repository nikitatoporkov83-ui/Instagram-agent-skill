"""Offline integration checks for the imported skills and all six Python CLIs."""

import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"
NAMES = {
    "ig-audit", "ig-caption", "ig-carousel", "ig-comment", "ig-dm",
    "ig-human", "ig-plan", "ig-profile", "ig-reel", "ig-reply",
    "ig-repurpose", "ig-story", "ig-viral",
}
TOOLS = {
    "hooks": "ig-reel/hookscore.py",
    "beats": "ig-reel/beats.py",
    "caption": "ig-caption/caption.py",
    "humanize": "ig-human/humanize.py",
    "detect": "ig-human/detect.py",
    "swipe": "ig-viral/swipe.py",
}
STRONG_HOOK = "Nobody tells you that your first 30 reels are supposed to flop."
WEAK_HOOK = "Hey guys, today I wanted to talk about content strategy"
CLEAN_TEXT = (
    "I lost $18,000 in June. I won't pay twice. You can copy my 4-line clause, "
    "but read it first because your job isn't mine, and your client might have "
    "a different plan. It saved Dana $900 on Friday. That's why I keep it. "
    "Your date goes in section 4.\n"
)
CAPTION = (
    "I lost $18,000 on one missing clause.\n\n"
    "My client contract now says payment is due on delivery, with a date both "
    "sides can check before the work starts. Save this.\n\n#contracts #freelance"
)
SCRIPT = (
    "I lost $18,000 on one clause.\n"
    "You can fix it in section 4.\n"
    "That clause saved Dana $900.\n"
)
TSV = (
    "account\tfollowers\tmedian\tviews\thook\n"
    f"@a\t4000\t1000\t60000\t{STRONG_HOOK}\n"
    "@b\t2000000\t900000\t1200000\tIn this video I show you my routine.\n"
    "@c\t48000\t11000\t412500\tSteal this four-line follow-up.\n"
)


class ToolTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cwd = Path(self.tmp.name)

    def run_tool(self, tool, *args, text="", expected=0):
        result = subprocess.run(
            [sys.executable, str(SKILLS / TOOLS[tool]), *map(str, args)],
            input=text, text=True, encoding="utf-8", capture_output=True,
            cwd=self.cwd, timeout=15,
        )
        self.assertEqual(
            result.returncode, expected,
            f"{tool}: exit {result.returncode}\n{result.stdout}\n{result.stderr}",
        )
        self.assertNotIn("Traceback", result.stderr)
        return result

    def run_json(self, tool, *args, text="", expected=0):
        return json.loads(self.run_tool(tool, *args, "--json", text=text, expected=expected).stdout)

    def test_all_six_clis_have_help(self):
        for tool in TOOLS:
            with self.subTest(tool=tool):
                self.assertIn("usage:", self.run_tool(tool, "--help").stdout)

    def test_hook_scores_distinguish_strong_and_weak_text(self):
        strong = self.run_json("hooks", "--hook", STRONG_HOOK)
        weak = self.run_json("hooks", "--hook", WEAK_HOOK)
        self.assertEqual(strong["verdict"], "STRONG")
        self.assertEqual(weak["verdict"], "WEAK")
        self.assertGreater(strong["score"], weak["score"])
        self.assertTrue(weak["flags"])

    def test_hook_ranking_from_file(self):
        path = self.cwd / "hooks.txt"
        path.write_text(WEAK_HOOK + "\n" + STRONG_HOOK, encoding="utf-8")
        output = self.run_tool("hooks", path).stdout
        self.assertIn("HOOK RANKING", output)
        self.assertLess(output.index("Nobody tells"), output.index("Hey guys"))

    def test_hook_rejection_and_empty_input_exit_codes(self):
        self.run_tool("hooks", "--hook", WEAK_HOOK, expected=1)
        self.assertIn("nothing to score", self.run_tool("hooks", expected=2).stderr)

    def test_beat_timing_counts_words_and_accumulates(self):
        data = self.run_json("beats", text=SCRIPT)
        self.assertEqual(data["total_words"], 18)
        self.assertAlmostEqual(data["total_seconds"], 18 * 60 / 165, places=2)
        self.assertEqual(len(data["beats"]), 3)
        self.assertEqual(data["beats"][0]["start"], 0)
        self.assertEqual(data["beats"][0]["label"], "HOOK")
        self.assertEqual(data["beats"][-1]["label"], "CTA")
        for previous, current in zip(data["beats"], data["beats"][1:]):
            self.assertAlmostEqual(
                previous["start"] + previous["dur"], current["start"], delta=0.02,
            )
        self.assertTrue(any("Loops:" in note for note in data["notes"]))

    def test_beat_rate_and_target_change_timing(self):
        normal = self.run_json("beats", text=SCRIPT)
        faster = self.run_json("beats", "--wpm", "330", "--target", "3.3", text=SCRIPT)
        self.assertAlmostEqual(faster["total_seconds"], normal["total_seconds"] / 2, delta=0.01)
        self.assertTrue(any("on target" in note for note in faster["notes"]))

    def test_beat_render_and_long_hook_warning(self):
        output = self.run_tool("beats", text=STRONG_HOOK + "\n" + SCRIPT).stdout
        self.assertIn("BEAT SHEET", output)
        self.assertIn("past the 3s mark", output)

    def test_beats_empty_input_is_rejected(self):
        self.assertIn("empty script", self.run_tool("beats", expected=2).stderr)

    def test_caption_ready_and_feed_truncation(self):
        data = self.run_json("caption", "--keywords", "client contract", text=CAPTION)
        self.assertEqual(data["verdict"], "READY")
        self.assertEqual(data["visible"], CAPTION[:125])
        self.assertEqual(data["characters"], len(CAPTION))
        self.assertEqual(data["asks"], ["save this"])
        self.assertEqual(data["hashtags"], ["#contracts", "#freelance"])
        output = self.run_tool("caption", text=CAPTION).stdout
        self.assertIn("WHAT THE FEED SHOWS", output)
        self.assertIn("VERDICT  READY", output)

    def test_caption_rejects_oversize_and_six_hashtags(self):
        for text, failed_check in [
            ("a" * 2201, "LENGTH"),
            (CAPTION + " #one #two #three #four", "HASHTAGS"),
        ]:
            with self.subTest(check=failed_check):
                data = self.run_json("caption", text=text, expected=1)
                self.assertEqual(data["verdict"], "FIX")
                checks = {item["check"]: item["status"] for item in data["checks"]}
                self.assertEqual(checks[failed_check], "FAIL")
                self.run_tool("caption", text=text, expected=1)

    def test_caption_reports_missing_keywords(self):
        data = self.run_json("caption", "--keywords", "missing search phrase", text=CAPTION, expected=1)
        search = next(c for c in data["checks"] if c["check"] == "SEARCH TERMS")
        self.assertEqual(search["status"], "FAIL")
        self.assertIn("missing search phrase", search["detail"])

    def test_humanizer_cleans_text_and_preserves_links(self):
        text = 'We\u200b delve into “growth”—then check https://example.com/leverage and hello@example.com.\n'
        data = self.run_json("humanize", text=text)
        self.assertEqual(
            data["text"],
            'We look at "growth", then check https://example.com/leverage and hello@example.com.\n',
        )
        for group in ("invisible", "typographic", "lexical"):
            self.assertTrue(data["report"][group], group)
        second = self.run_json("humanize", text=data["text"])
        self.assertEqual(second["text"], data["text"])

    def test_humanizer_output_file_and_report(self):
        before = self.cwd / "before.txt"
        after = self.cwd / "after.txt"
        before.write_text("We leverage a robust system.\n", encoding="utf-8")
        result = self.run_tool("humanize", before, "-o", after, "--report")
        self.assertTrue(after.is_file())
        self.assertNotIn("leverage", after.read_text(encoding="utf-8"))
        self.assertIn("HUMANIZE REPORT", result.stderr)

    def test_humanizer_preserves_russian_letters(self):
        data = self.run_json("humanize", text="Привет\u200b, мир!\n")
        self.assertEqual(data["text"], "Привет, мир!\n")

    def test_detection_pass_and_flagged_exit_codes(self):
        good = self.run_json("detect", text=CLEAN_TEXT)
        bad_text = "We leverage robust seamless solutions. " * 10
        bad = self.run_json("detect", text=bad_text)
        self.assertEqual(good["verdict"], "PASS")
        self.assertEqual(bad["verdict"], "FLAGGED")
        self.assertGreater(good["human_score"], bad["human_score"])
        self.run_tool("detect", text=CLEAN_TEXT)
        self.run_tool("detect", text=bad_text, expected=1)

    def test_detection_before_after_json(self):
        before = self.cwd / "before.txt"
        after = self.cwd / "after.txt"
        before.write_text("We leverage robust seamless solutions. " * 10, encoding="utf-8")
        after.write_text(CLEAN_TEXT, encoding="utf-8")
        data = self.run_json("detect", before, after)
        self.assertEqual(len(data), 2)
        self.assertGreater(data[1]["human_score"], data[0]["human_score"])
        output = self.run_tool("detect", before, after).stdout
        self.assertIn("FLAGGED", output)
        self.assertIn("PASS", output)

    def test_swipe_ranks_relative_to_each_account(self):
        data = self.run_json("swipe", text=TSV)
        self.assertEqual(data["n"], 3)
        self.assertEqual(data["accounts"], 3)
        self.assertEqual(data["baseline"], "account median")
        self.assertEqual([r["account"] for r in data["reels"]], ["@a", "@c", "@b"])
        self.assertEqual(data["reels"][0]["outlier"], 60)
        self.assertEqual(data["reels"][1]["outlier"], 37.5)
        self.assertEqual(data["reels"][0]["formula_id"], 3)
        self.assertIsNotNone(data["reels"][0]["hook_score"])

    def test_swipe_falls_back_to_followers(self):
        data = self.run_json("swipe", text=f"@a\t4000\t60000\t{STRONG_HOOK}\n")
        self.assertEqual(data["baseline"], "follower count")
        self.assertEqual(data["reels"][0]["outlier"], 15)

    def test_swipe_exports_markdown_to_current_and_nested_directories(self):
        for filename in ("swipe.md", "nested/swipe.md"):
            with self.subTest(filename=filename):
                result = self.run_tool("swipe", "--out", filename, text=TSV)
                markdown = (self.cwd / filename).read_text(encoding="utf-8")
                self.assertIn("# Swipe file", markdown)
                self.assertIn("60.0x", markdown)
                self.assertIn("Nobody Tells You", markdown)
                self.assertIn("SWIPE FILE", result.stdout)

    def test_swipe_empty_input_is_rejected(self):
        self.assertIn("no usable rows", self.run_tool("swipe", expected=2).stderr)

    def test_discovered_skill_paths_load_sibling_resources(self):
        for client in (".agents", ".claude"):
            for tool, text in (("humanize", "We leverage a robust system."), ("swipe", TSV)):
                with self.subTest(client=client, tool=tool):
                    result = subprocess.run(
                        [sys.executable, str(ROOT / client / "skills" / TOOLS[tool]), "--json"],
                        input=text, text=True, encoding="utf-8", capture_output=True,
                        cwd=self.cwd, timeout=15,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    data = json.loads(result.stdout)
                    if tool == "swipe":
                        self.assertEqual(data["reels"][0]["formula_id"], 3)
                        self.assertIsNotNone(data["reels"][0]["hook_score"])
                    else:
                        self.assertNotIn("leverage", data["text"])


class AssetTests(unittest.TestCase):
    def test_all_thirteen_skills_have_metadata_and_discovery_links(self):
        self.assertEqual({p.name for p in SKILLS.iterdir() if p.is_dir()}, NAMES)
        for name in sorted(NAMES):
            with self.subTest(skill=name):
                skill = SKILLS / name
                text = (skill / "SKILL.md").read_text(encoding="utf-8")
                self.assertTrue(text.startswith("---\n"))
                frontmatter = text.split("---", 2)[1]
                self.assertIn(f"name: {name}", frontmatter)
                self.assertIn("description:", frontmatter)
                for client in (".agents", ".claude"):
                    link = ROOT / client / "skills" / name
                    self.assertTrue(link.is_symlink(), str(link))
                    self.assertEqual(link.resolve(), skill.resolve())

    def test_plugin_metadata_matches_marketplace(self):
        plugin = json.loads((ROOT / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
        marketplace = json.loads((ROOT / ".claude-plugin/marketplace.json").read_text(encoding="utf-8"))
        self.assertEqual(plugin["name"], marketplace["plugins"][0]["name"])
        self.assertTrue((ROOT / marketplace["plugins"][0]["source"]).is_dir())
        self.assertEqual(plugin["license"], "MIT")

    def test_formulas_and_lexicon_regexes_compile(self):
        hooks = json.loads((SKILLS / "ig-reel/hooks.json").read_text(encoding="utf-8"))
        self.assertEqual(len(hooks["hooks"]), 26)
        self.assertEqual({h["id"] for h in hooks["hooks"]}, set(hooks["classify_order"]))
        for item in hooks["hooks"]:
            re.compile(item["match"], re.IGNORECASE)
        lexicon = json.loads((SKILLS / "ig-human/slop.json").read_text(encoding="utf-8"))
        for item in lexicon["structures"]:
            re.compile(item["regex"], re.MULTILINE)
        self.assertEqual(len(lexicon["words"]) + len(lexicon["phrases"]), 154)

    def test_profile_rubric_sums_to_one_hundred(self):
        rubric = json.loads((SKILLS / "ig-profile/rubric.json").read_text(encoding="utf-8"))
        self.assertEqual(len(rubric["items"]), 12)
        self.assertEqual(sum(item["points"] for item in rubric["items"]), 100)
        self.assertEqual(rubric["total"], 100)


if __name__ == "__main__":
    unittest.main()
