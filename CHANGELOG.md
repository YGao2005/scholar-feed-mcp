# Changelog

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
