# Distribution submission packets (paste-ready)

Local working draft, generated 2026-06-03. Turns the DISTRIBUTION-HANDOFF playbook
into copy-paste submissions. Every fact is verified against the repo: 25 tools,
600,000+ CS/AI/ML papers, anonymous 100/day, free key 1,000/day, Pro 10,000/day,
install `npx scholar-feed-mcp init`. Zero em or en dashes. Not committed (drafts
stay local per the current plan).

Order: do the GATE first, then ship-today 1 to 7, then this-week 8 to 10, then 11.

----------------------------------------------------------------------

## GATE (do this first): publish npm 3.7.1

Verified state: npm has 3.7.0 published and it does NOT carry `mcpName`. The local
package.json is 3.7.1 with `mcpName: io.github.YGao2005/scholar-feed-mcp`, and
server.json already targets 3.7.1. The Official MCP Registry (packet 1) verifies
ownership by reading `mcpName` from the PUBLISHED npm package, so it cannot succeed
until 3.7.1 is live on npm. PulseMCP and the VS Code `@mcp` gallery also ingest from
the registry downstream, so this one publish unblocks several listings.

```bash
npm run build                      # refresh build/ (package.json files = ["build"])
npm pack --dry-run 2>&1 | grep -i mcpName   # optional: confirm mcpName ships in the tarball metadata
npm publish                        # publishes 3.7.1; needs npm login + 2FA
```

Verify after publishing:

```bash
npm view scholar-feed-mcp version    # expect 3.7.1
npm view scholar-feed-mcp mcpName    # expect io.github.YGao2005/scholar-feed-mcp
```

----------------------------------------------------------------------

## Shared metadata (reuse across every form below)

- Display name: `Scholar Feed`
- npm package / slug: `scholar-feed-mcp`
- Registry name: `io.github.YGao2005/scholar-feed-mcp`
- Repository: `https://github.com/YGao2005/scholar-feed-mcp`
- Homepage: `https://www.scholarfeed.org`
- npm URL: `https://www.npmjs.com/package/scholar-feed-mcp`
- Category: Search (or Research, where a research label exists)
- Transport: `stdio`
- Auth: optional API key `SF_API_KEY` (secret, not required)
- Contact email: `hello@scholarfeed.org`
- Icon: `assets/icon.png` (400x400). Caveat: it is a transparent BLACK mark, so it
  is faint on dark UIs (the Cline panel). Reads fine on light cards (npm, Glama,
  mcp.so).

One-line description (under ~160 chars, dash-free):

> Search 600,000+ CS/AI/ML papers with citation-graph traversal, full-text
> extraction, embeddings, and BibTeX export, inside Claude Code, Cursor, and other
> MCP clients.

Server config block (the repo `.mcp.json`, paste where a form asks for config):

```json
{
  "mcpServers": {
    "scholar-feed": {
      "command": "npx",
      "args": ["-y", "scholar-feed-mcp"]
    }
  }
}
```

----------------------------------------------------------------------

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

Prereq: the GATE above (npm 3.7.1 live with mcpName). server.json is ready
(version 3.7.1, npm/stdio, SF_API_KEY optional secret).

```bash
brew install mcp-publisher
mcp-publisher login github       # opens a browser GitHub auth for io.github.YGao2005/*
mcp-publisher publish            # reads ./server.json
```

Verify: search for `scholar-feed` at registry.modelcontextprotocol.io, and confirm
the version reads 3.7.1. Downstream, PulseMCP auto-ingests and the VS Code `@mcp`
gallery picks it up; no separate submission needed for those two.

## 2. Glama (glama.ai/mcp)

Auto-indexes any public repo with a LICENSE (satisfied: MIT). The repo already has
`glama.json` (`{"$schema":"https://glama.ai/mcp/schemas/server.json","maintainers":["YGao2005"]}`).

- Sign in at glama.ai with GitHub.
- Find `YGao2005/scholar-feed-mcp` (search if not yet indexed) and click Claim.
- No form fields beyond the claim; Glama reads the repo and glama.json.

## 3. mcp.so (mcp.so/submit)

Form fields to paste:

- Type: `MCP Server`
- Name: `Scholar Feed`
- URL: `https://github.com/YGao2005/scholar-feed-mcp`
- Description: the one-line description above.
- Server Config: the server config block above.

Confirm any extra fields against the live form before submitting.

## 4. mcpservers.org (mcpservers.org/submit)

This is the ONLY route into wong2/awesome-mcp-servers (they reject PRs). Fields:

- Name: `Scholar Feed`
- Short description: `MCP server for searching 600,000+ CS/AI/ML papers: semantic search, citation graph, full text, embeddings, and BibTeX, inside Claude Code and Cursor.`
- Link: `https://github.com/YGao2005/scholar-feed-mcp`
- Category: `Search`
- Contact email: `hello@scholarfeed.org`

## 5. punkpeye/awesome-mcp-servers (GitHub PR)

Fork, add ONE line under `### 🔬 Research` in alphabetical order, open a PR.
Exact line (legend: 📇 = TypeScript, ☁️ = cloud service):

```markdown
- [YGao2005/scholar-feed-mcp](https://github.com/YGao2005/scholar-feed-mcp) 📇 ☁️ - Semantic search over 600k+ CS/AI/ML papers with citation-graph traversal, full-text extraction, embeddings, and BibTeX export. Install: `npx scholar-feed-mcp init`.
```

PR title: `Add YGao2005/scholar-feed-mcp under Research`. Re-check the legend emojis
in the repo's current README before submitting; awesome lists tweak their legend.

## 6. Cursor Directory (cursor.directory/plugins/new)

- Sign in with GitHub or Google.
- Paste the repo URL: `https://github.com/YGao2005/scholar-feed-mcp`.
- It auto-detects via `.mcp.json`. Confirm the parsed name (`scholar-feed`) and the
  description, then submit.

## 7. Cline MCP Marketplace (GitHub issue at cline/mcp-marketplace)

Open a new issue using their submission template. Body to paste:

```
GitHub Repo URL: https://github.com/YGao2005/scholar-feed-mcp

Logo (400x400 PNG): assets/icon.png in the repo
  (https://raw.githubusercontent.com/YGao2005/scholar-feed-mcp/main/assets/icon.png)

Short description:
Scholar Feed is an open-source MCP server that searches 600,000+ CS/AI/ML papers
from arXiv, traces the citation graph, pulls full text from LaTeX, and exports
BibTeX, without leaving your editor. Anonymous access is 100 calls/day; a free key
raises it to 1,000/day. 25 tools.

Why it is useful:
It runs a literature review where you already work (Claude Code, Cursor, Claude
Desktop). Each paper carries an LLM summary and a 0 to 1 novelty score, so an agent
can filter for genuinely new work, trace what cites a key result, and draft a
related-work section in one session.

[x] I have tested that the MCP server installs and runs from the README.
[x] The README contains clear, self-installable setup instructions.
```

Cline installs from your README, so confirm the README is self-installable before
filing. Note: `assets/icon.png` is faint on Cline's dark panel; consider supplying a
light-on-dark or branded-tile 400x400 PNG instead if you want it to pop.

----------------------------------------------------------------------

## 8. Smithery (this week, small packaging)

Cheapest path that keeps stdio: build an MCPB bundle (see packet 9), then:

```bash
smithery mcp publish ./scholar-feed-mcp.mcpb -n @YGao2005/scholar-feed
```

Hosting via Smithery `runtime: typescript` would need code changes to export a
Smithery-shaped server; skip unless you want a hosted option.

## 9. Claude Desktop Extension (MCPB bundle)

manifest.json is ready (manifest_version 0.3, icon wired to assets/icon.png).

```bash
npm i -g @anthropic-ai/mcpb
mcpb validate manifest.json
npm run build && npm install --production
mcpb pack .                         # bundles node_modules + build/ into a .mcpb
```

Test by dragging the resulting `.mcpb` into Claude Desktop. The curated directory
listing additionally needs a published privacy policy (see docs/legal drafts).

## 10. Docker MCP Catalog (optional)

A Dockerfile now exists at the repo root (wraps the stdio server). Submit a PR to
docker/mcp-registry via their wizard:

```bash
# in a clone of docker/mcp-registry
task wizard
```

Point it at `https://github.com/YGao2005/scholar-feed-mcp`. Optional; lower
priority than 1 to 7.

----------------------------------------------------------------------

## 11. Anthropic Connectors Directory (later, real work)

Not viable yet. Requires a REMOTE HTTPS MCP server plus OAuth 2.0 (the SF_API_KEY
paste model does not qualify), `readOnlyHint` on every read tool, and published
privacy + terms pages. Highest-value audience, so worth planning toward once a
remote + OAuth deployment exists. No paste-ready packet until then.

----------------------------------------------------------------------

## Suggested order and dependencies

1. GATE: npm publish 3.7.1 (unblocks 1, and downstream PulseMCP + VS Code gallery).
2. Packet 1 (MCP Registry), then 2 (Glama), 3 (mcp.so), 4 (mcpservers.org),
   6 (Cursor): all quick, no packaging.
3. Packet 5 (punkpeye PR) and 7 (Cline issue): need a few minutes each.
4. Packets 9 then 8 (MCPB bundle, then Smithery): one build, two listings.
5. Packet 10 (Docker) when convenient.
6. Packet 11 (Anthropic) is gated on a remote + OAuth backend, plus legal pages.

Cross-cutting blockers you still own: a published privacy policy and terms page on
scholarfeed.org (needed for Cline's curated listing and for Anthropic). Drafts are
in docs/legal.
