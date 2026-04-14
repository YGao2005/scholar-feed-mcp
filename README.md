# Scholar Feed MCP Server

Search 560,000+ CS/AI/ML research papers with LLM-powered novelty analysis from Claude Code, Cursor, or any MCP client.

[Scholar Feed](https://www.scholarfeed.org) indexes arXiv papers daily and ranks them using a multi-signal scoring system (recency, citation velocity, institutional reputation, code availability). Each paper has an LLM-generated summary and novelty score.

## Quick Start

```bash
npx scholar-feed-mcp init
```

This interactive wizard will:
1. Optionally ask for an API key (or skip for anonymous access)
2. Detect your MCP client (Claude Code, Cursor, or Claude Desktop)
3. Write the config and verify the connection

**No API key required.** Anonymous access gives you 100 calls/day — enough for a typical research session. For higher limits (500/day), get a free key at [scholarfeed.org/settings](https://www.scholarfeed.org/settings).

Try asking: *"Search for recent papers on test-time compute scaling"*

## What You Can Do

**Technology scouting** — "What novel research on retrieval-augmented generation was published this month?"

**Literature review** — "Find papers similar to 2401.04088 and export their BibTeX"

**Trend monitoring** — "What's trending in cs.CV this week? Summarize the top 3."

**Deep dives** — "Run a deep research session on 'reasoning in large language models'"

**Benchmark tracking** — "Show me the MMLU leaderboard and compare GPT-4 vs LLaMA-3"

**Author discovery** — "Who are the top researchers working on efficient LLM inference?"

## Manual Installation

### Claude Code

```bash
# Without API key (anonymous, 100 calls/day)
claude mcp add scholar-feed -- npx -y scholar-feed-mcp

# With API key (500 calls/day)
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

## Available Tools (23)

### Core Search & Discovery

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `search_papers` | Full-text keyword search with filters | `q`, `category`, `novelty_min`, `days`, `method_category`, `task`, `dataset`, `contribution_type`, `task_category`, `has_results`, `cursor`, `limit` |
| `get_paper` | Get full paper details by arXiv ID | `arxiv_id`, `fields` |
| `find_similar` | Find similar papers via embedding + bibliographic coupling | `arxiv_id`, `limit`, `days` |
| `get_citations` | Citation graph (outgoing refs or incoming citations) | `arxiv_id`, `direction`, `limit`, `fields` |
| `whats_trending` | Today's trending papers by composite score | `category`, `limit`, `fields`, `exclude_ids` |
| `batch_lookup` | Look up multiple papers at once | `arxiv_ids` (max 50), `fields` |

### Paper Content

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `fetch_fulltext` | Extract results/experiments from LaTeX source | `arxiv_id` |
| `fetch_repo` | Get GitHub repo README + file tree | `arxiv_id` |
| `export_bibtex` | Export BibTeX for papers | `arxiv_ids` (max 50) |
| `get_paper_results` | Structured benchmark results from a paper | `arxiv_id` |

### Benchmarks & Methods

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `search_benchmarks` | Find datasets/benchmarks by name | `q`, `limit` |
| `get_leaderboard` | SOTA leaderboard for a dataset | `dataset`, `metric`, `limit` |
| `get_benchmark_stats` | Score distribution stats (min, max, median, etc.) | `dataset`, `metric` |
| `get_benchmark_timeline` | Raw score data points over time | `dataset`, `metric` |
| `search_by_method` | Search by technique name (LoRA, YOLO, DPO, etc.) | `q`, `contribution_type`, `task_category`, `limit` |
| `compare_methods` | Side-by-side model comparison across benchmarks | `models` (2-10), `dataset`, `metric` |

### Authors

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `discover_authors` | Find researchers by topic or name | `q`, `field`, `limit` |
| `get_author` | Detailed author profile (h-index, topics, top papers) | `author_id` |
| `get_author_papers` | All papers by an author (paginated) | `author_id`, `limit`, `page` |

### Research

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_research_landscape` | Aggregated landscape stats for a topic | `q`, `limit` |
| `deep_research` | Multi-round research synthesis (30-120s) | `topic`, `depth` |
| `refine_research` | Follow-up question on a completed research report | `report_id`, `question`, `date_from`, `date_to` |

### Utility

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `check_connection` | Verify API key, show plan and usage | — |

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
| `check_connection` | 60/min |
| `search_papers` | 30/min |
| `get_paper` | 60/min |
| `find_similar` | 20/min |
| `get_citations` | 30/min |
| `whats_trending` | 30/min |
| `fetch_fulltext` | 10/min |
| `batch_lookup` | 20/min |
| `fetch_repo` | 10/min |
| `export_bibtex` | 20/min |
| `deep_research` | 5/min |
| `refine_research` | 5/min |
| `search_benchmarks` | 30/min |
| `get_leaderboard` | 30/min |
| `get_benchmark_stats` | 30/min |
| `get_benchmark_timeline` | 30/min |
| `search_by_method` | 30/min |
| `compare_methods` | 20/min |
| `discover_authors` | 20/min |
| `get_author` | 60/min |
| `get_author_papers` | 30/min |
| `get_research_landscape` | 10/min |
| `get_paper_results` | 30/min |

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

## Verify Installation

After setup, ask your AI assistant to run `check_connection`. You should see:

```json
{
  "status": "ok",
  "plan": "free",
  "key_name": "my-key",
  "usage_today": 0
}
```

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
Anonymous mode allows 100 calls/day. Get a free API key at [scholarfeed.org/settings](https://www.scholarfeed.org/settings) for 500 calls/day.

**Tool calls time out or fail silently**
Ensure Node.js 18+ is installed (`node --version`). Older versions lack the native `fetch` API.

**Stale npx cache**
If you're stuck on an old version after an update: `npx --yes scholar-feed-mcp@latest`

**Windows: "command not found"**
Use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "scholar-feed-mcp"]` in your MCP config.

## License

[MIT](LICENSE)
