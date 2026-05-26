# Changelog

## [3.0.2] - 2026-05-26

### Removed

- `search_papers` `has_results` filter and `get_paper` `include_results` parameter. These exposed the
  `paper_results` benchmark-extraction table, which is abstract-only (~10% corpus coverage) and not
  reliable enough to surface. The structured-extraction filters (`dataset`, `method_name`,
  `method_category`, `task`, `task_category`, `contribution_type`) and `verbose` are unaffected — they
  read columns on the papers table, not `paper_results`. Server-side data is left dormant (reversible).

### Fixed

- `get_paper` now actually forwards `fields` and `verbose` to the API — field selection / the verbose
  28-field shape were previously declared but silently ignored on the default JSON path.
- `get_paper` `arxiv_ids` is now capped at 50 in the schema (matches the documented batch limit).
- `init` wizard uses `path.dirname` instead of manual `/`-slicing, fixing config-dir creation on Windows.

### Added

- Request timeout on all API calls (default 30s, override with `SF_API_TIMEOUT_MS`). A stalled backend
  now returns a clear "timed out" error instead of hanging the tool call indefinitely.

### Changed

- Corpus size corrected to **600,000+** across the README, package description, and tool descriptions
  (was inconsistently 512k / 560k).
- Rate-limit table corrected: `get_paper` 60→**30/min** (the default batch path), `get_field_orientation`
  5→**20/min**. README parameter tables fixed for `get_paper`, `co_author_graph`, and `get_field_orientation`.
- Removed stale references to retired tools (`discover_authors`, `search_by_method`, and the post-install
  `check_connection` hint).

### Internal

- Replaced the string-grep "tests" with a real behavioral suite (tool registry, HTTP client, and tool
  handlers exercised with a mocked `fetch`). Test runner switched to `tsx` so it runs on Node 18/20/22
  (the previous `--experimental-strip-types` flag is 22.6+ only, which had left CI red).
- Bumped `@modelcontextprotocol/sdk` to `^1.29`; `npm audit` is clean. Added a `prepublishOnly` guard
  (`build && test`) and a `bugs` URL.

## [3.0.1] - 2026-05-26

### Changed

- docs: free-tier copy corrected 500→1,000/day per account to match enforced backend limit (Phase 116). README, src/client.ts, src/init.ts updated. No API surface change.

## [3.0.0] - 2026-05-25

### Removed (breaking)

Hard cutover from v1.x — no deprecation window. Tool count: 15 → 8.

**Absorbed into `search_papers`:**
- `find_similar` — use `search_papers(anchor_paper_id=<id>)` for embedding-based similarity.
- `find_citations_about` — use `search_papers(scope_to_citations_of=<arxiv_id>, q=<query>)`.
- `whats_trending` — use `search_papers(sort='trending', category=<cat>)`.

**Absorbed into `get_paper`:**
- `batch_lookup` — use `get_paper(arxiv_ids=[...])` (GET /public/papers?arxiv_ids[]=... endpoint, cap N=50).
- `export_bibtex` — use `get_paper(arxiv_ids=[...], format='bibtex')`.

**Merged into `find_author`:**
- `discover_authors` — use `find_author(q=<query>)` for name/topic search.
- `get_author` — use `find_author(id=<author_id>)` for profile lookup.

**Demoted to skills (no MCP tool):**
- `compare_methods` — use the `/compare-methods` skill; backend POST /public/methods/compare endpoint retained for skill use.
- `field_guide` — cheap retrieval half migrated to the new `get_field_orientation` tool; full orientation via the `/field-guide` skill; backend route retained for skill use.

**Killed (no replacement):**
- `check_connection` — 4 observed calls from 1 caller (boilerplate pattern, no response-payload branching). Errors signal connectivity. Remove any health-check calls.
- `fetch_repo` — 0 observed calls in production. Backend route preserved for skill use.

### Added

- `find_author` — merged `discover_authors` + `get_author` into a single tool. Exactly-one-of semantics: pass `q` for name/topic search or `id` for profile lookup.
- `get_field_orientation` — cheap retrieval orientation for a research area (0.6 × norm_citation + 0.4 × cosine reranking). No DeepSeek, no Pro quota. Pairs with the `/field-guide` skill for deeper orientation.
- `co_author_graph` — co-authorship neighborhood for an author (edges derived live from paper_authors join; 500-edge cap). First public npm release; shipped locally in the unpublished v2.1.0 build.
- `embed_text` — 768-dim Gemini Flash embedding for text (RETRIEVAL_DOCUMENT default; RETRIEVAL_QUERY opt-in via `task_type`). Useful for HyDE composition. First public npm release; shipped locally in the unpublished v2.1.0 build.

### Changed

- `search_papers`: gains `sort` (`'relevance'|'recent'|'trending'`), `anchor_paper_id` (similar-paper discovery), `scope_to_citations_of` (citation-scoped search), and `mode` (`'semantic'|'keyword'`) parameters. `q` is now optional when `anchor_paper_id` is provided.
- `get_paper`: gains `arxiv_ids` (batch lookup, up to 50 IDs via GET query params) and `format` (`'json'|'bibtex'`). Single-ID `arxiv_id` remains supported.

### Migration

See the [README migration table](README.md#migrating-from-v1x-to-v300) for the full removed-tool → v3 replacement mapping.

Note: the local v2.0.0 and v2.1.0 builds (the latter added `co_author_graph` and `embed_text`) were never published to npm — the last published release was v1.3.2. External `npx` users jump directly from v1.x to v3.0.0.

## [2.0.0] - 2026-05-23

### Removed (breaking)
- `get_leaderboard` tool — unregistered from the MCP tool surface. The underlying `paper_results` data had two extraction problems: (1) results from 2024 and earlier were never extracted, and (2) extracted rows mixed legitimate benchmark scores with non-score values (efficiency deltas, pruning budgets, qualitative claims) because the LLM prompt didn't enforce a `result_kind` discriminator. Canonical-metric filtering then surfaced only the frozen 2022 PwC archive, which made leaderboards silently 4 years stale. Source file preserved at `src/tools/get_leaderboard.ts` for potential revival after extraction quality is fixed.
- Tool count: 16 → 15.

### Migration
- Use `search_papers(q="<benchmark name>", contribution_type="method", days=365)` and read `llm_summary` for headline numbers. For exact scores, follow up with `fetch_fulltext(arxiv_id, sections="results")` on the top candidates.

## [1.8.0] - 2026-05-20

### Added
- `find_citations_about` tool — semantic filter over a paper's citation graph. Answers questions like "find papers citing X that talk about Y" (e.g. "citations of AIAYN about protein folding"). Takes the top 2000 citation neighbours by rank_score, then re-ranks them by cosine similarity to a query embedding. Each result includes a `similarity_score` (typically 0.5–0.75 for relevant matches). Endpoint: `GET /public/papers/{arxiv_id}/citations/about`.

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
