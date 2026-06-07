# Distribution and docs handoff (scholar-feed-mcp)

Prepared 2026-06-02 by a prior session (working from a different repo) to hand off to a session working directly in THIS repo. Two jobs: (1) improve the docs (professional, concise, humanized), and (2) execute MCP distribution. The submission artifacts are already built; this is the playbook.

Internal working doc. Not published to npm (package.json `files` is `["build"]`). Delete before a public-polish pass if you do not want it in the repo.

## What this product is

scholar-feed-mcp is a stdio MCP server (Node/TypeScript, on npm) that gives an AI assistant a research copilot over 600,000+ CS/AI/ML papers: semantic search, citation graph, co-author graph, full-text extraction, foundational-lineage lookup, embeddings, BibTeX, plus saved libraries/collections/watches. Backend: api.scholarfeed.org. Site: scholarfeed.org. Auth is `SF_API_KEY` and is OPTIONAL (anonymous 100 calls/day, keyed 1,000/day, Pro 10,000/day).

## State of the repo after the prior session

Done:
- `README.md`: humanized. Removed all 31 em dashes and AI tells, preserved every command, tool name, number, table row, and code block (verified: code blocks byte-identical, 36 headings / 80 table rows / 18 fences unchanged). Added a light/dark `<picture>` logo header.
- Logos in `assets/`: `logo-light.{svg,png}`, `logo-dark.{svg,png}`, `icon.png`. Transparent 400x400 PNGs (background tile stripped) plus transparent SVG sources.
- `package.json`: added `"mcpName": "io.github.YGao2005/scholar-feed-mcp"` (registry ownership marker) and removed an em dash from `description`.
- New distribution artifacts at repo root:
  - `.mcp.json`: Cursor auto-detect plus the canonical copy-paste config.
  - `server.json`: official MCP Registry manifest (v3.7.0, npm/stdio, `SF_API_KEY` optional + secret).
  - `manifest.json`: MCPB desktop-extension manifest (`manifest_version` 0.3, `icon` wired to assets/icon.png, 11 headline tools, key as optional keychain `user_config`).

Not done:
- Nothing was committed or pushed. Branch was `feat/library-collections-watches` with unrelated WIP. Land the README, package.json, `.mcp.json`, `server.json`, `manifest.json`, and `assets/` on `main` before publishing.

## Operator hard rules

- NO em or en dashes anywhere (README, code comments, docs, commit messages). Scan before shipping: `grep -rnP '\x{2014}|\x{2013}' README.md docs/` (or ripgrep: `rg '\x{2014}|\x{2013}'`). Apply the `/humanizer` skill methodology (de-AI, but keep technical accuracy).
- Never invent a tool name, parameter, or number. Verify against `src/tools/*.ts` and the live API.

## Docs improvement goals (the main ask)

1. Make the README more professional and concise. It is comprehensive but long; tighten without losing the install matrix. Keep zero em dashes.
2. Reconcile the tool count. The README header says "Available Tools (22)" but the tables list 24 and `src/tools/index.ts` registers ~24 (including `ask_library`, `update_watch`, `preview_watch`). The barrel comment also says "v3.5 surface (22 tools)". Pick the real number, fix the header, the barrel comment, and any CHANGELOG mention.
3. Align all docs to the real tool surface: README tables, `CHANGELOG.md`, `CONTRIBUTING.md`, and the `docs/*-spec.md` files. Tool names and params must match `src/tools/*.ts` exactly.
4. Consider collapsing the long "Manual Installation" section (about 12 clients) into the standard block plus a compact per-client note table.
5. Add a short positioning line near the top aimed at the ICP (researchers doing literature review inside Claude Code or Cursor).

## Distribution playbook (artifacts are ready; execute these)

Full per-surface requirements also live at `ScholarFeed Vault/90 Reference/MCP Distribution Checklist.md` (may not be reachable from this workspace; essentials are below).

Build-once assets status: LICENSE present (MIT), README humanized, `.mcp.json`, `server.json`, `manifest.json`, `mcpName`, and a 400x400 logo all done. Remaining shared prep: a privacy policy and terms page on scholarfeed.org (needed for the Cline directory and the Anthropic directory).

Ship today (accept the npx/GitHub package as-is):
1. Official MCP Registry. Bump npm to 3.7.1 so the published package carries `mcpName`, set `server.json` `version` to match, then `brew install mcp-publisher`, `mcp-publisher login github`, `mcp-publisher publish`. This feeds PulseMCP (auto-ingest) and the VS Code `@mcp` gallery downstream.
2. Glama (glama.ai/mcp). Auto-indexes the repo (LICENSE is the gate, satisfied). Sign in with GitHub to claim. Optional `glama.json`: `{"$schema":"https://glama.ai/mcp/schemas/server.json","maintainers":["YGao2005"]}`.
3. mcp.so. Form at mcp.so/submit: Type=MCP Server, Name, URL, optional Server Config (use `.mcp.json`).
4. mcpservers.org/submit. The ONLY way into wong2/awesome-mcp-servers (they reject PRs). Fields: name, short description, link, category=Search, contact email.
5. punkpeye/awesome-mcp-servers. PR, add to `### 🔬 Research`, alphabetical. Line:
   `- [YGao2005/scholar-feed-mcp](https://github.com/YGao2005/scholar-feed-mcp) 📇 ☁️ - Semantic search over 600k+ CS/AI papers with citation-graph traversal, full-text extraction, embeddings, and BibTeX export. Install: ` + "`npx scholar-feed-mcp init`" + `.`
6. Cursor Directory. cursor.directory/plugins/new, sign in with GitHub or Google, paste the repo URL (auto-detects via `.mcp.json`).
7. Cline MCP Marketplace. Open an issue at github.com/cline/mcp-marketplace (the template), give the repo URL plus a 400x400 PNG (`assets/icon.png`), tick the two confirmation boxes. Cline installs from your README, so the README must be self-installable.

This week (a little packaging):
8. Smithery. Cheapest path that keeps stdio: build an MCPB bundle, then `smithery mcp publish ./<bundle>.mcpb -n @YGao2005/scholar-feed`. Hosting via `runtime: typescript` would need code changes to export a Smithery-shaped server.
9. Claude Desktop Extension (MCPB). `npm i -g @anthropic-ai/mcpb`, `mcpb validate manifest.json`, `npm run build && npm install --production`, `mcpb pack .` (bundles `node_modules` plus `build/`). Test by dragging the `.mcpb` into Claude Desktop. The curated directory listing also needs a privacy policy.
10. Docker MCP Catalog. Needs a Dockerfile wrapping the stdio server; PR to docker/mcp-registry via `task wizard`. Optional.

Later (real work):
11. Anthropic Connectors Directory. Requires a remote HTTPS MCP server plus OAuth 2.0 (the `SF_API_KEY` paste model does not qualify), plus `readOnlyHint` on every tool and a privacy policy and terms. Not viable until a remote and OAuth deployment exists. It is the highest-value audience, so worth planning toward.

## Open items and caveats

- `assets/icon.png` is a transparent BLACK mark, so it reads on light cards (npm, Glama, mcp.so) but is faint on dark UIs like the Cline panel. When finalizing branding, consider a branded tile or a theme-aware icon. The transparent `logo-light.png` and `logo-dark.png` already cover the README via the `<picture>` swap.
- Privacy policy and terms pages are still needed (Cline directory and Anthropic).
- Reconcile the "22 vs 24" tool count across the README, the barrel comment, and the CHANGELOG.
