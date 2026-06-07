# Discovery prep handoff

Staging drafts for three discovery workstreams, produced 2026-06-03. These are NOT
committed plugin/site files; they are reviewable drafts. Move each into place when
you act on it. Nothing here touches `main`, tags, or publishing.

All files were checked for the house rules: zero em or en dashes, no invented tool
names or numbers, product facts verified against the repo (25 tools, 600,000+
papers, anonymous 100/day, free key 1,000/day, Pro 10,000/day).

## 1. Claude Code plugin + skills (`plugin-prep/`)

- `plugin.json`, `marketplace.json` = the proposed `.claude-plugin/` manifests; the plugin ships the MCP server (inline `mcpServers`, `npx -y scholar-feed-mcp`).
- `README.md` = the plugin's install/usage page.
- `NOTES.md` = exact activation steps (`claude plugin validate`, `claude --plugin-dir .`, `/plugin marketplace add YGao2005/scholar-feed-mcp`, `/plugin install scholar-feed@scholar-feed`), plus the GAP list.

**Decision you owe this workstream:** the repo has no `skills/` directory. The MCP-only plugin is valid and shippable as-is, but the `/field-guide`, `/compare-methods`, and `scholar-feed` skills referenced on scholarfeed.org/skills are not in version control here. To bundle them, supply each `SKILL.md` under `skills/<name>/` at the plugin root (see `NOTES.md` GAP list). Ship MCP-only now, add skills in a later version bump.

## 2. SEO + AEO (`seo-aeo/`)

- `developers-page.draft.md` = a scholarfeed.org/developers landing page targeting the five target queries, with install, a tool overview, and an FAQ.
- `llms.txt.draft` = a proposed `/llms.txt` for scholarfeed.org (llmstxt.org format) pointing agents at the MCP server and docs.
- `seo-aeo-checklist.md` = on-page actions plus paste-ready JSON-LD (SoftwareApplication, FAQPage, Organization), llms.txt placement, and answer-engine citation steps.

**Next:** publish the `/developers` page and `/llms.txt` on scholarfeed.org; paste the JSON-LD into the relevant pages.

## 3. Socials (`socials/`)

- `social-preview-spec.md` = the 1280x640 GitHub social-preview spec (layout, copy, which `assets/` files to use, and the Settings path to upload it).
- `demo-cast-script.md` = a 15 to 30 second asciinema/VHS storyboard (exact commands plus captions).
- `launch-posts.md` = ready-to-post drafts: an X thread, an r/LocalLLaMA post, a Show HN title plus first comment, and a Discord showcase blurb.

**Next:** upload the social preview in GitHub Settings, record the cast, and hold the posts for your launch moment.
