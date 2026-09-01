<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
    <img alt="Scholar Feed" src="assets/logo-light.png" width="140" height="140">
  </picture>
</p>

# Scholar Feed MCP Server

[![CI](https://github.com/YGao2005/scholar-feed-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/YGao2005/scholar-feed-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/scholar-feed-mcp.svg)](https://www.npmjs.com/package/scholar-feed-mcp)
[![Node](https://img.shields.io/node/v/scholar-feed-mcp.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/npm/l/scholar-feed-mcp.svg)](./LICENSE)
[![smithery badge](https://smithery.ai/badge/yangg40/scholar-feed)](https://smithery.ai/servers/yangg40/scholar-feed)

Research paper search with ranking and citation tracking, for LLM engineering and academic research, without leaving Claude Code, Cursor, or any MCP client.

Most paper tools hand back a flat list. Scholar Feed ranks it: sort by relevance, by proven citation count, or by rising impact, then trace any paper's citation lineage forward and backward across 22M+ edges. 600k+ CS/AI/ML papers, updated daily, each with an LLM-generated summary and novelty score.

[Scholar Feed](https://www.scholarfeed.org) indexes arXiv papers daily and ranks them on recency, citation velocity, institutional reputation, and code availability.

## Quick Start

```bash
npx scholar-feed-mcp@latest init
```

This interactive wizard will:
1. Optionally ask for an API key (or skip for anonymous access)
2. Detect your MCP client (Claude Code, Cursor, or Claude Desktop)
3. Write the config and verify the connection

**No API key required.** Anonymous access gives you 100 calls/day, enough for a typical research session. For higher limits (1,000/day per account), get a free key at [scholarfeed.org/settings](https://www.scholarfeed.org/settings).

Try asking: *"Search for recent papers on test-time compute scaling"*

## What You Can Do

**Technology scouting:** "What novel research on retrieval-augmented generation was published this month?"

**Literature review:** "Find papers similar to 2401.04088 and export their BibTeX"

**Trend monitoring:** "What's trending in cs.CV this week? Summarize the top 3."

**Author discovery:** "Who are the top researchers working on efficient LLM inference?"

**Field orientation:** "Give me an orientation report on sparse mixture-of-experts architectures."

## Installation

The fastest path is `npx scholar-feed-mcp@latest init`, which auto-detects your client and writes the config. To set it up by hand, every client launches the same stdio server (`npx -y scholar-feed-mcp@latest`); only the config-file location and the wrapper key differ.

**Claude Desktop (one-click)** installs without editing any config: download the `.mcpb` bundle from the [latest release](https://github.com/YGao2005/scholar-feed-mcp/releases/latest) and open it (or drag it into **Settings > Extensions**). The installer shows one optional field for a Scholar Feed API key (`sf_...`): leave it blank for anonymous mode (100 calls/day), or paste a free key from [scholarfeed.org/settings](https://www.scholarfeed.org/settings) for 1,000/day.

**Claude Code** takes a one-line command:

```bash
# Anonymous (100 calls/day)
claude mcp add scholar-feed -- npx -y scholar-feed-mcp@latest

# With an API key (1,000 calls/day per account)
claude mcp add scholar-feed -e SF_API_KEY=sf_your_key_here -- npx -y scholar-feed-mcp@latest
```

**Every other client** takes this standard JSON block:

```json
{
  "mcpServers": {
    "scholar-feed": {
      "command": "npx",
      "args": ["-y", "scholar-feed-mcp@latest"]
    }
  }
}
```

To raise limits to 1,000 calls/day, add `"env": { "SF_API_KEY": "sf_your_key_here" }` to the server entry. Get a free key at [scholarfeed.org/settings](https://www.scholarfeed.org/settings).

Drop that block into the right config file:

| Client | Config file | Notes |
|--------|-------------|-------|
| Cursor | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) | Restart Cursor. |
| Claude Desktop | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json` | Settings → Developer → Edit Config, then restart. |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | Cascade → MCP icon → Configure, then refresh. |
| Cline / Roo Code | `cline_mcp_settings.json` | MCP Servers sidebar icon → Configure. Cline and Roo Code share this format. |
| Gemini CLI | `~/.gemini/settings.json` (or project `.gemini/settings.json`) | |
| LM Studio | `~/.lmstudio/mcp.json` | Program tab → Install → Edit `mcp.json`. Follows Cursor's notation. |
| JetBrains (PyCharm / IntelliJ) | AI Assistant → MCP → Add → As JSON | Requires AI Assistant 2025.1+. |

A few clients need a different wrapper key or file format:

<details>
<summary><strong>OpenAI Codex, VS Code (GitHub Copilot), Zed, Continue, and project-scoped configs</strong></summary>

**OpenAI Codex** (`~/.codex/config.toml`, or `$CODEX_HOME/config.toml` if you set that) uses TOML, not JSON — the block above will not work. One file serves both the Codex CLI and the IDE extension.

```toml
[mcp_servers.scholar-feed]
command = "npx"
args = ["-y", "scholar-feed-mcp@latest"]
env = { SF_API_KEY = "sf_your_key_here" }
```

Drop the `env` line to run keyless at 100 calls/day. On Windows, if Codex cannot launch the server, use `command = "cmd"` with `args = ["/c", "npx", "-y", "scholar-feed-mcp@latest"]`.

**VS Code: GitHub Copilot** (`.vscode/mcp.json`) uses a `servers` key and an explicit `type`, and needs Copilot agent mode. You can also run `MCP: Add Server` from the Command Palette.

```json
{
  "servers": {
    "scholar-feed": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "scholar-feed-mcp@latest"]
    }
  }
}
```

**Zed** (`settings.json`) uses a `context_servers` key, and the `"source": "custom"` line is required (without it, Zed silently skips the entry).

```json
{
  "context_servers": {
    "scholar-feed": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "scholar-feed-mcp@latest"]
    }
  }
}
```

**Continue** uses YAML, with `mcpServers` as a list, in `~/.continue/config.yaml` (global) or `.continue/config.yaml` (workspace).

```yaml
mcpServers:
  - name: scholar-feed
    type: stdio
    command: npx
    args:
      - "-y"
      - scholar-feed-mcp@latest
```

**Project-scoped** (`.mcp.json`), to share the server across a repo:

```json
{
  "mcpServers": {
    "scholar-feed": {
      "command": "npx",
      "args": ["-y", "scholar-feed-mcp@latest"],
      "env": { "SF_API_KEY": "${SF_API_KEY}" }
    }
  }
}
```

</details>

**Windows:** for any JSON config above, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "scholar-feed-mcp@latest"]`.

Scholar Feed is a standard stdio MCP server, so any other MCP-compatible client works with the standard block too.

## Available Tools (26)

### Core Search & Discovery

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `search_papers` | Semantic + keyword search with filters. Also does similar-paper discovery, citation-scoped search, and trending. | `q`, `category`, `novelty_min`, `days`, `sort`, `anchor_paper_id`, `scope_to_citations_of`, `mode`, `method_category`, `task`, `dataset`, `contribution_type`, `task_category`, `cursor`, `limit` |
| `get_paper` | Get full paper details by arXiv ID. Also handles batch lookup and BibTeX export. | `arxiv_ids`, `format`, `fields`, `verbose` |
| `get_citations` | Citation graph (outgoing refs or incoming citations) | `arxiv_id`, `direction`, `limit`, `fields` |
| `fetch_fulltext` | Extract results/experiments from LaTeX source. `sections: 'all'` returns the whole paper instead of the lean results excerpt. | `arxiv_id`, `sections` |

### Authors

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `find_author` | Find researchers by topic/name query, or retrieve a profile by ID. | `q`, `id`, `field`, `limit` |
| `co_author_graph` | Co-authorship neighborhood for an author | `author_ids`, `window_years` |

### Embeddings

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `embed_text` | Get a 768-dim Gemini embedding for text (for HyDE and custom similarity). **Pro-only**, so anonymous/free callers get a 403 `pro_required`. | `text`, `task_type` |

### Research

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_field_orientation` | Cheap retrieval orientation for a research area: top papers, subfields, open problems. No Pro quota. | `topic`, `limit` |
| `get_foundational_lineage` | Foundational work for a *paper's niche* via the citation graph (consensus-then-lift): niche_roots → field_level → discipline, with `cited_by_in_niche` evidence. Surfaces canonical anchors semantic search misses. No Pro quota. | `anchor_paper_id`, `scope`, `generality_ceiling`, `limit` |
| `check_drift` | "Is the method I use superseded — and by what?" Critique receipts + benchmark-dominance edges over ~10 LLM builder-problem families. No Pro quota. | `family`, `method`, `limit` |

### Library, Collections, Watches & Gap Analysis (require `SF_API_KEY`)

These MUTATE or read the authenticated user's account. The core read/search tools above work anonymously; these need a key.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `save_paper` | Bookmark a paper to your library (idempotent; feeds personalization). | `arxiv_id` |
| `unsave_paper` | Remove a paper from your library (idempotent). | `arxiv_id` |
| `like_paper` | "More like this" calibration signal for the For You feed (insert-only). | `arxiv_id` |
| `list_library` | List your saved papers, newest first. | `limit`, `page` |
| `list_collections` | List collections with paper counts. | (none) |
| `create_collection` | Create a named collection (get-or-create; no error on duplicate). | `name` |
| `add_to_collection` | Add a paper to a collection by name or id (also auto-saves). | `arxiv_id`, `collection_name`, `collection_id` |
| `remove_from_collection` | Remove a paper from a collection (stays saved). | `arxiv_id`, `collection_name`, `collection_id` |
| `create_watch` | Standing daily-evaluated saved search; get-or-create by name. Define it with a structured `criteria` filter (recommended) or a single seed selector. | `name`, `novelty_min`, `criteria`, `recency_days`, `q`, `collection_name`, `collection_id`, `anchor_paper_id`, `scope_to_citations_of`, `author_id`, `category` |
| `list_watches` | List watches with summary, `last_evaluated_at`, and `pending_hits`. | (none) |
| `check_watches` | Pull new matches since the last digest (read-only, idempotent). | `watch_name`, `watch_id`, `limit` |
| `update_watch` | Edit a watch in place: rename, change `novelty_min`, or retarget its structured `criteria` (clears pending hits). Address by name or id. | `name`, `watch_id`, `new_name`, `novelty_min`, `criteria`, `recency_days` |
| `preview_watch` | Dry-run a structured `criteria` filter over recent papers without creating a watch; returns `match_count` and a `sample` to tune before saving. Read-only. | `criteria`, `recency_days` |
| `delete_watch` | Delete a watch by name or id (idempotent). | `name`, `watch_id` |
| `find_gaps` | "What am I missing?" for a collection or topic: foundational + frontier work you haven't saved (read-only, **Pro**). | `collection_name`, `collection_id`, `topic`, `scope`, `limit` |
| `ask_library` | "Answer from my saved set": a cited synthesis over your library or one collection, grounded only in papers you've saved (read-only). The inverse of `find_gaps`. **Free 1/month, then Pro 200/day.** | `question`, `collection_name`, `collection_id`, `limit` |

## Novelty Score

Every paper has an `llm_novelty_score` from 0.0 to 1.0:

| Range | Meaning | Example |
|-------|---------|---------|
| 0.7+ | Paradigm shift or broad SOTA | New architecture that changes the field |
| 0.5-0.7 | Novel method with strong results | New training technique with clear gains |
| 0.3-0.5 | Incremental improvement | Applying known method to new domain |
| <0.3 | Survey, dataset, or minor extension | Literature review, benchmark release |

Use `novelty_min: 0.5` in `search_papers` to filter for genuinely novel work.

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `search_papers` | 30/min |
| `get_paper` | 30/min |
| `get_citations` | 30/min |
| `fetch_fulltext` | 10/min |
| `find_author` | 20/min |
| `co_author_graph` | 20/min |
| `embed_text` | 30/min |
| `get_field_orientation` | 20/min |
| `get_foundational_lineage` | 20/min |
| `find_gaps` | 20/min |
| `ask_library` | 10/min |

Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

**Daily volume quota** (separate from the per-minute limits above, counted per account across all your keys): **100 calls/day** anonymous, **1,000/day** with a free key, **10,000/day** on Pro. The AI synthesis tools have their own limits: `ask_library` is **1/month free, then 200/day on Pro**; `find_gaps` and `embed_text` are **Pro-only** (a 403 `pro_required` otherwise).

## Example Response

`search_papers` with `q: "attention mechanism"` returns:

```json
{
  "papers": [
    {
      "arxiv_id": "2401.04088",
      "title": "Attention Is All You Need (But Not All You Get)",
      "authors": ["A. Researcher", "B. Scientist"],
      "year": 2024,
      "categories": ["cs.LG", "cs.AI"],
      "primary_category": "cs.LG",
      "arxiv_url": "https://arxiv.org/abs/2401.04088",
      "has_code": true,
      "github_url": "https://github.com/example/repo",
      "citation_count": 42,
      "rank_score": 0.73,
      "llm_summary": "Proposes a sparse attention variant that reduces compute by 60% while matching dense attention accuracy on 5 benchmarks.",
      "llm_novelty_score": 0.55
    }
  ],
  "total": 1847,
  "page": 1,
  "limit": 20,
  "next_cursor": "eyJzIjogMC43MywgImlkIjogIjI0MDEuMDQwODgifQ=="
}
```

Pass `next_cursor` back to get the next page (keyset pagination, which is more stable than page numbers for large result sets).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SF_API_KEY` | No | (none) | Your Scholar Feed API key (starts with `sf_`). Without it, runs in anonymous mode (100 calls/day). |
| `SF_API_BASE_URL` | No | Production URL | Override API base URL |

## Development

```bash
npm install
npm run build      # Build to build/
npm run dev        # Watch mode
npm run typecheck  # Type check without emitting
npm test           # Run tests
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Troubleshooting

**"Authentication failed: your SF_API_KEY is invalid"**
The key may have been revoked. Generate a new one at [scholarfeed.org/settings](https://www.scholarfeed.org/settings). Or remove the key to use anonymous mode.

**"Rate limit exceeded" or "Anonymous daily limit exceeded"**
Anonymous mode allows 100 calls/day. Get a free API key at [scholarfeed.org/settings](https://www.scholarfeed.org/settings) for 1,000 calls/day per account.

**Server shows as "failed" with no error — especially right after an update**
The first launch (and the first launch after each new release) makes `npx` download the package. The published bin is a single self-contained file with no dependency tree to resolve, so this is fast — but on a slow link it can still outrun your client's start-up timeout, and the server then shows as "failed" with no detail. Fixes: (1) warm the cache by running it once in a terminal — `npx -y scholar-feed-mcp@latest --version` — then restart your client; (2) raise the MCP start-up timeout if your client supports it (Claude Code: `MCP_TIMEOUT=60000`). For the fastest, offline-capable launches, install once globally and point the config at it instead of `npx`:

```bash
npm install -g scholar-feed-mcp
# then in your MCP config:  "command": "scholar-feed-mcp", "args": []
```

**Tool calls time out or fail silently**
Ensure Node.js 18+ is installed (`node --version`). Older versions lack the native `fetch` API.

**Stale npx cache**
The config blocks above pin `scholar-feed-mcp@latest`, which re-resolves the newest version each launch. If you previously used an unpinned `scholar-feed-mcp` and are stuck on an old build: `npx --yes scholar-feed-mcp@latest`.

**Windows: "command not found"**
Use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "scholar-feed-mcp@latest"]` in your MCP config.

## About Scholar Feed

[Scholar Feed](https://www.scholarfeed.org) is a research-discovery engine for computer science and AI/ML papers, founded in 2025. It indexes 600,000+ papers from arXiv — ranked by novelty, citation velocity, and relevance — with LLM-generated summaries, a citation graph, author profiles, and full-text extraction. It is available as a website, a public REST API, and a Model Context Protocol (MCP) server that AI agents can call directly. This package (`scholar-feed-mcp`) is the open-source MCP server.

- Website: <https://www.scholarfeed.org>
- npm: <https://www.npmjs.com/package/scholar-feed-mcp>
- REST API: <https://api.scholarfeed.org/v1>

## Privacy

See our [privacy policy](https://www.scholarfeed.org/privacy-policy).

## License

[MIT](LICENSE)
