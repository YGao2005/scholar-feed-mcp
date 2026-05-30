# Scholar Feed MCP Server

[![CI](https://github.com/YGao2005/scholar-feed-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/YGao2005/scholar-feed-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/scholar-feed-mcp.svg)](https://www.npmjs.com/package/scholar-feed-mcp)
[![Node](https://img.shields.io/node/v/scholar-feed-mcp.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/npm/l/scholar-feed-mcp.svg)](./LICENSE)

Search 600,000+ CS/AI/ML research papers with LLM-powered novelty analysis from Claude Code, Cursor, or any MCP client.

[Scholar Feed](https://www.scholarfeed.org) indexes arXiv papers daily and ranks them using a multi-signal scoring system (recency, citation velocity, institutional reputation, code availability). Each paper has an LLM-generated summary and novelty score.

## Quick Start

```bash
npx scholar-feed-mcp init
```

This interactive wizard will:
1. Optionally ask for an API key (or skip for anonymous access)
2. Detect your MCP client (Claude Code, Cursor, or Claude Desktop)
3. Write the config and verify the connection

**No API key required.** Anonymous access gives you 100 calls/day — enough for a typical research session. For higher limits (1,000/day per account), get a free key at [scholarfeed.org/settings](https://www.scholarfeed.org/settings).

Try asking: *"Search for recent papers on test-time compute scaling"*

## Migrating from v1.x to v3.0.0

v3.0.0 is a **hard cutover** — there is no deprecation window. The previous v1.x tool surface was consolidated down to 8 focused tools. Existing agents using removed tools will need to update their calls before upgrading.

### Breaking changes — full replacement table

| Removed tool (v1.x) | v3 replacement |
|---|---|
| `find_similar(arxiv_id=id)` | `search_papers(anchor_paper_id=id)` |
| `find_citations_about(arxiv_id=X, query=Q)` | `search_papers(scope_to_citations_of=X, q=Q)` |
| `whats_trending(category=C)` | `search_papers(sort='trending', category=C)` |
| `batch_lookup(arxiv_ids=[...])` | `get_paper(arxiv_ids=[...])` |
| `export_bibtex(arxiv_ids=[...])` | `get_paper(arxiv_ids=[...], format='bibtex')` |
| `discover_authors(q=Q)` | `find_author(q=Q)` |
| `get_author(author_id=id)` | `find_author(id=id)` |
| `compare_methods(models=[...])` | Use the `/compare-methods` skill (see [scholarfeed.org/skills](https://www.scholarfeed.org/skills)) |
| `field_guide(topic=T)` | `get_field_orientation(topic=T)` for cheap retrieval; full orientation via the `/field-guide` skill |
| `check_connection` | Removed — errors signal connectivity. No action needed; remove any health-check calls. |
| `fetch_repo(arxiv_id=id)` | Removed — 0 observed calls in production. Backend route preserved for skill use. |

### The 9 v3 tools

| Tool | Description |
|---|---|
| `search_papers` | Semantic + keyword search. Now also handles similar-paper discovery (`anchor_paper_id`), citation-scoped search (`scope_to_citations_of`), and trending (`sort='trending'`). |
| `get_paper` | Full paper details by arXiv ID. Now also handles batch lookup (`arxiv_ids=[...]`) and BibTeX export (`format='bibtex'`). |
| `get_citations` | Citation graph — outgoing refs or incoming citations (`direction='citing'/'cited'`). |
| `fetch_fulltext` | Extract results/experiments sections from LaTeX source. |
| `find_author` | Find authors by name/topic query (`q=`) or retrieve a profile by ID (`id=`). Merges the former `discover_authors` + `get_author`. |
| `co_author_graph` | Co-authorship neighborhood for an author — edges derived live from the citation graph. |
| `embed_text` | Get a 768-dim Gemini embedding for a text string (useful for HyDE and custom similarity). |
| `get_field_orientation` | Cheap retrieval orientation for a research area — top papers, subfields, open problems. No Pro quota. |
| `get_foundational_lineage` | The foundational work for a *paper's niche* via the citation graph — niche_roots → field_level → discipline (collapsed landmarks), with `cited_by_in_niche` evidence. Surfaces canonical anchors semantic search misses. No Pro quota. |

**New in v3.1.0:**
- `get_foundational_lineage` — paper-anchored citation-graph lineage (consensus-then-lift). Answers the *relative* question: what is foundational for THIS paper's specific niche, not the obvious global landmarks. Complements `get_field_orientation` (topic-anchored, retrieval-only).

**New in v3.0.0** (reaching npm for the first time):
- `find_author` — merged `discover_authors` + `get_author` into a single tool with exactly-one-of (`q` or `id`) semantics.
- `get_field_orientation` — the cheap-retrieval half of the former `field_guide`, demoted from tool to skill in v3 but re-added as a lightweight tool (0.6 × citation score + 0.4 × cosine similarity; no DeepSeek, no Pro quota). Pairs with the `/field-guide` skill for deeper orientation.
- `co_author_graph` and `embed_text` — shipped in the local v2.1.0 build but never published to npm; v3.0.0 is the first public release of both.

## What You Can Do

**Technology scouting** — "What novel research on retrieval-augmented generation was published this month?"

**Literature review** — "Find papers similar to 2401.04088 and export their BibTeX"

**Trend monitoring** — "What's trending in cs.CV this week? Summarize the top 3."

**Author discovery** — "Who are the top researchers working on efficient LLM inference?"

**Field orientation** — "Give me an orientation report on sparse mixture-of-experts architectures."

## Manual Installation

### Claude Code

```bash
# Without API key (anonymous, 100 calls/day)
claude mcp add scholar-feed -- npx -y scholar-feed-mcp

# With API key (1,000 calls/day per account)
claude mcp add scholar-feed -e SF_API_KEY=sf_your_key_here -- npx -y scholar-feed-mcp
```

### Cursor (.cursor/mcp.json)

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

To add an API key, add `"env": { "SF_API_KEY": "sf_your_key_here" }` to the config.

### Claude Desktop (claude_desktop_config.json)

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

### Project-scoped (.mcp.json)

```json
{
  "mcpServers": {
    "scholar-feed": {
      "command": "npx",
      "args": ["-y", "scholar-feed-mcp"],
      "env": { "SF_API_KEY": "${SF_API_KEY}" }
    }
  }
}
```

**Windows note:** Use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "scholar-feed-mcp"]`.

## Available Tools (9)

### Core Search & Discovery

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `search_papers` | Semantic + keyword search with filters. Also does similar-paper discovery, citation-scoped search, and trending. | `q`, `category`, `novelty_min`, `days`, `sort`, `anchor_paper_id`, `scope_to_citations_of`, `mode`, `method_category`, `task`, `dataset`, `contribution_type`, `task_category`, `cursor`, `limit` |
| `get_paper` | Get full paper details by arXiv ID. Also handles batch lookup and BibTeX export. | `arxiv_ids`, `format`, `fields`, `verbose` |
| `get_citations` | Citation graph (outgoing refs or incoming citations) | `arxiv_id`, `direction`, `limit`, `fields` |
| `fetch_fulltext` | Extract results/experiments from LaTeX source | `arxiv_id` |

### Authors

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `find_author` | Find researchers by topic/name query, or retrieve a profile by ID. | `q`, `id`, `field`, `limit` |
| `co_author_graph` | Co-authorship neighborhood for an author | `author_ids`, `window_years` |

### Embeddings

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `embed_text` | Get a 768-dim Gemini embedding for text (for HyDE and custom similarity) | `text`, `task_type` |

### Research

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_field_orientation` | Cheap retrieval orientation for a research area — top papers, subfields, open problems. No Pro quota. | `topic`, `limit` |
| `get_foundational_lineage` | Foundational work for a *paper's niche* via the citation graph (consensus-then-lift): niche_roots → field_level → discipline, with `cited_by_in_niche` evidence. Surfaces canonical anchors semantic search misses. No Pro quota. | `anchor_paper_id`, `scope`, `generality_ceiling`, `limit` |

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

Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

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

Pass `next_cursor` back to get the next page (keyset pagination — more stable than page numbers for large result sets).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SF_API_KEY` | No | — | Your Scholar Feed API key (starts with `sf_`). Without it, runs in anonymous mode (100 calls/day). |
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

**Tool calls time out or fail silently**
Ensure Node.js 18+ is installed (`node --version`). Older versions lack the native `fetch` API.

**Stale npx cache**
If you're stuck on an old version after an update: `npx --yes scholar-feed-mcp@latest`

**Windows: "command not found"**
Use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "scholar-feed-mcp"]` in your MCP config.

## License

[MIT](LICENSE)
