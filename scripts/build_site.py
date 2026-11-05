#!/usr/bin/env python3
"""Build the offline website and its standalone, downloadable HTML preview."""

import importlib.util
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def module(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def main():
    hook = module("site_hook", "skills/ig-reel/hookscore.py")
    caption = module("site_caption", "skills/ig-caption/caption.py")
    beat = module("site_beat", "skills/ig-reel/beats.py")
    skills = []
    for file in sorted((ROOT / "skills").glob("*/SKILL.md")):
        raw = file.read_text(encoding="utf-8")
        skills.append({"id": file.parent.name, "instructions": raw})
    data = {
        "skills": skills,
        "hooks": json.loads((ROOT / "skills/ig-reel/hooks.json").read_text()),
        "lexicon": json.loads((ROOT / "skills/ig-human/slop.json").read_text()),
        "rubric": json.loads((ROOT / "skills/ig-profile/rubric.json").read_text()),
        "hookConfig": {
            "spoken": sorted(hook.SPOKEN_NUMBERS), "money": sorted(hook.MONEY_WORDS),
            "stakes": sorted(hook.STAKES), "weak": hook.WEAK_OPENERS,
            "imperatives": sorted(hook.IMPERATIVES),
            "dealbreakers": [[p.pattern, message] for p, message in hook.DEALBREAKERS],
            "number": hook.NUMBER_RE.pattern,
        },
        "captionConfig": {"asks": [[p.pattern, name] for p, name in caption.ASKS],
                          "filler": sorted(caption.FILLER_TAGS)},
        "stopwords": sorted(beat.STOPWORDS),
    }
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    serialized = serialized.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    (WEB / "data.js").write_text("// Generated from canonical skill files. Run scripts/build_site.py to refresh.\n"
                                 "globalThis.IG_DATA = " + serialized + ";\n", encoding="utf-8")
    html = (WEB / "index.html").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css">',
                        "<style>\n" + (WEB / "styles.css").read_text(encoding="utf-8") + "\n</style>")
    for name in ("data.js", "engine.js", "app.js"):
        script = (WEB / name).read_text(encoding="utf-8")
        script = re.sub(r"</script", r"<\\/script", script, flags=re.IGNORECASE)
        html = html.replace(f'<script src="{name}" defer></script>', "<script>\n" + script + "\n</script>")
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "instagram-studio.html").write_text(html, encoding="utf-8")
    with zipfile.ZipFile(dist / "instagram-studio.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("instagram-studio/index.html", html)
        archive.write(ROOT / "LICENSE", "instagram-studio/LICENSE")
        archive.write(ROOT / "WEBSITE_RU.md", "instagram-studio/README.md")
    print(f"Built {len(skills)} skills, {len(data['hooks']['hooks'])} hook formulas and standalone HTML.")
    print("Preview: dist/instagram-studio.html")
    print("Download: dist/instagram-studio.zip")


if __name__ == "__main__":
    main()
