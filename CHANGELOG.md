# Changelog

## [1.7.0] - 2026-05-15

### Changed
- **Lean default response shape** for the 6 paper-listing tools (`search_papers`, `get_paper`, `find_similar`, `get_citations`, `whats_trending`, `batch_lookup`). Default now returns 12 high-signal fields per paper (arxiv_id, title, authors, year, categories, has_code, github_url, citation_count, venue_name, llm_summary, llm_significance, llm_novelty_score) — ~60% smaller than the prior 28-field shape.
- Pass `verbose: true` on any of those tools to restore the full 28-field shape (method/task/dataset extraction, application_domain, baselines, etc.). Explicit `fields=...` continues to override both.
- `whats_trending` now returns `trending_score`, `paper_quality`, and `citation_velocity` on each paper so an agent can see *why* a paper is ranked highly, not just that it appears in the list.
- `field_guide` response now caps the `papers` array at 10 entries × 5 fields (was up to 34 × 11). The curated structure in `report_body` already references papers by arxiv_id; the `papers` array is now a thin lookup table providing enrichment.

### Fixed
- `get_citations` now orders results by `rank_score DESC, published_date DESC` — high-impact citing papers first. Previously results came back in DB-natural order (effectively random).
- `discover_authors` no longer emits a hardcoded `relevance_score: 1.0` for name-search results. The score is now omitted when there's no semantic distance to report.
- `institution_tags` are now populated on all paper-listing endpoints (previously only `get_paper` actually fetched them; others emitted `[]`).
- Search keyword-mode responses now emit `"mode": "keyword"` correctly (was missing the field).

## [1.3.0] - 2026-04-13

### Changed
- **API key is now optional** — works without signup, anonymous access gets 100 calls/day
- `deep_research` and `refine_research` show clear guidance when called without an API key
- Tool descriptions for research tools mention the API key requirement
- Updated all install examples to show no-key setup first

## [1.2.1] - 2026-03-21

### Added
- `refine_research` tool — ask follow-up questions on completed deep research reports

### Fixed
- `deep_research` switched from SSE to poll-based to fix timeout issues with MCP clients

## [1.2.0] - 2026-03-19

### Added
- 11 new tools for benchmarks, authors, and methods:
  - `get_paper_results` — structured benchmark results from a paper
  - `get_leaderboard` — SOTA leaderboard for any dataset
  - `search_benchmarks` — find datasets/benchmarks by name
  - `get_benchmark_stats` — score distribution statistics
  - `get_benchmark_timeline` — raw score data points over time
  - `search_by_method` — search by technique name (LoRA, YOLO, DPO, etc.)
  - `compare_methods` — side-by-side model comparison
  - `discover_authors` — find researchers by topic or name
  - `get_author` — detailed author profile
  - `get_author_papers` — paginated author paper list
  - `get_research_landscape` — aggregated topic landscape statistics

### Changed
- `search_papers` now supports additional filters: `method_category`, `task`, `dataset`, `contribution_type`, `task_category`, `has_results`
- `deep_research` temporal boost for recency-sensitive queries

## [1.1.0] - 2026-03-17

### Added
- `deep_research` tool — multi-round research synthesis with clustering
- `fetch_repo` tool — GitHub repository README + file tree
- `export_bibtex` tool — BibTeX export for paper collections
- `batch_lookup` tool — look up multiple papers in one call

## [1.0.0] - 2026-03-15

### Added
- Initial release with 8 core tools
- `check_connection`, `search_papers`, `get_paper`, `find_similar`, `get_citations`, `whats_trending`, `fetch_fulltext`
- Interactive setup wizard (`npx scholar-feed-mcp init`)
- Support for Claude Code, Cursor, and Claude Desktop
