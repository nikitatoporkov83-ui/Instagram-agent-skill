# Instagram agent skills

This project contains 13 agent skills and six local Python command-line tools.
The tools use only the Python standard library; use Python 3.10 or newer.
The Python tools need no application server or API key. The `web/` directory
contains a standalone browser application; see `WEBSITE_RU.md`.

## Skills and scripts

Canonical skill folders live in `skills/ig-*`. Project-local discovery folders
`.agents/skills/` (Codex) and `.claude/skills/` (Claude Code) link to those same
folders. Read the relevant `SKILL.md` before using a skill. Run a Python script
from its own skill folder, or give its path from the project root, for example:

```bash
python3 skills/ig-reel/hookscore.py --hook 'I lost $18,000 on one missing contract.'
python3 -m unittest discover -s tests -v
```

## Project-local account data

For this project, interpret the upstream skills' `~/.claude/instagram/` paths
as `.instagram/` under this checkout. This applies to `voice.md`, `swipe.md`,
`plan.md`, and `log.md`. Keep account data here rather than writing global
configuration. The directory is ignored by Git. If `voice.md` is missing,
copy `templates/voice.md` there without overwriting any existing profile.
An empty template is not a completed voice profile; ask for the user's real
examples and details when a content task requires them.

The lexicon, hook scoring, speech timing, and text patterns are designed for
English. Do not present scores or timings for Russian or other languages as
validated. Follow the user's language preference when writing content and
explain the tools' language limits when relevant.

## Validation and provenance

Run `python3 -m unittest discover -s tests -v` after changes. It exercises all
six CLIs, their positive and negative paths, JSON assets, and skill links.
See `SETUP_RU.md` for local usage and the upstream revision. Preserve the MIT
license and author attribution.

For website changes, run `python3 scripts/build_site.py` to refresh `web/data.js`
and the standalone preview in `dist/`. JavaScript uses canonical constants
exported from the original Python tools. The website is static and works offline.
Keep user input escaped when rendering HTML and preserve the language limits.
Do not describe prompt assembly as AI generation or imply Instagram is connected.

The optional Instagram integration lives in `backend/` (Cloudflare Workers/D1)
and `web/instagram.js`. Use Node.js 22+, `npm ci --prefix backend`,
`npm test --prefix backend`, and `npm run check --prefix backend` for its checks.
See `INSTAGRAM_SETUP_RU.md` for real Meta application and hosting requirements.
Never put Meta secrets or Instagram tokens in frontend files, Git, or logs.
Do not claim a live connection based on emulator tests. Every publication needs
explicit confirmation of its media, caption, and account.

The optional Apify bridge is `backend/src/apify.mjs`; an independent Worker can
use `backend/wrangler.apify.toml` without Meta or D1. `web/apify-data.js` is the
shared allowlisted projection for browser imports, backend responses, and the
collection CLI. Run `python3 scripts/check_apify_browser.py` for its UI checks.
Keep provider credentials in secure settings; the site accepts only a distinct
studio access code. Do not label a caption score as a reviewed video hook.
See `APIFY_SETUP_RU.md`; real collection needs a configured APIFY_API_TOKEN.
