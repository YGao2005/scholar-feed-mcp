# Handoff: surface `impact_pct` / `impact_tier` in the MCP (scoring-consolidation slice 1)

**Date:** 2026-06-06 · **Status:** PART A DONE + DEPLOYED (prod Heroku v427, merged master via PR #30); PART B (MCP client) NEXT · **Owner:** next session

> **Update 2026-06-06:** Part A shipped. `api/routers/public.py` now returns `impact_pct`+`impact_tier` on every lean paper (all 14 serializer-fed SELECTs, not just search), accepts `impact_min` (0-100), and `sort='trending'`→`impact_pct DESC NULLS LAST`. Live-verified. Caveats: (a) `sort='trending'` on BROAD keyword queries times out (pre-existing — composite did too; now fixable with an index on `impact_pct` since it's a column — deferred follow-up); (b) `impact_pct`/`impact_tier` are NULL on papers outside the recent scoring window (older/canonical papers) — for those, `citation_count` is the signal. Bugs found+fixed during deploy: keyword `impact_min` indentation-nesting, test callers + test-DB schema. See memory `scholar-feed-scoring-consolidation.md`.

## Why this exists
Consolidating Scholar Feed's **three** overlapping paper scores into one coherent system:
- `llm_novelty_score` — LLM judge from title+abstract ONLY, venue-independent → genuinely orthogonal "is this a *new idea*". Saturated by construction (37% of papers = exactly 0.55). **Keep as a secondary dimension/filter, not a headline.**
- `rank_score` — legacy hand-weighted blend (recency/h-index/citations/has_code/institution). **Retire** (impact_pct subsumes it via ML). Currently on the paper-detail RankScoreBadge + default search sort.
- `impact_pct` — ML forecaster (12-mo citations), true per-category percentile; already eats novelty+author-pedigree+has_code. **This is the single headline signal.** `impact_tier` = derived A+/A/B/C/D.

**Decision:** impact_pct (+ tier) = the one headline everywhere; novelty = orthogonal filter; retire rank_score. Venue reality-check: no paper-level venue signal exists and can't for fresh papers (arXiv venue lags acceptance) — don't chase it; impact_pct is already the empirical one.

See memory `scholar-feed-scoring-consolidation.md`.

## What already shipped (2026-06-06, don't redo)
- **v422** — fixed `impact_pct` coverage: the nightly percentile pass (`recompute_impact_scores`, `nightly_rank_refresh.py:~984`) was spilling its 55k-row `cume_dist` sort to disk under default `work_mem`, blowing the 180s timeout, failing *non-fatal* → raw `impact_score` landed but `impact_pct` was NULL on fresh papers while the step read `ok`. Fix = `SET work_mem` (env `IMPACT_PCT_WORK_MEM=256MB`) + `degraded` step status + new `impact_pct_coverage` SLO. Coverage backfilled live. **Merged to master via PR #26.**
- **v423/v424** — restored PR #25 (streaming scraper OOM fix + INCR-01 `internal_citations`) which an earlier mcp-oauth deploy had silently clobbered.
- Coverage is healthy (`/health/freshness` → `impact_pct_coverage: ok 100`).

## The work (THREE parts, in order)

### Part A — Backend: expose impact in the public API (PREREQUISITE; do first)
The public search/get API does **not** return `impact_pct`/`impact_tier` today — only `home.py` (Rising rail) and watches do. File: `backend/api/routers/public.py`.
1. **Pydantic model** (`~line 187`, next to `llm_novelty_score: Optional[float]`): add `impact_pct: Optional[int]` and `impact_tier: Optional[str]`.
2. **`LEAN_FIELDS`** (`~line 264`): add `"impact_pct"`, `"impact_tier"` so they're in the default lean shape.
3. **Row serializer** (`~line 328`, where `"llm_novelty_score": row.get(...)`): add `impact_pct` and a derived `impact_tier`.
   - `impact_tier` is **derived from the raw `impact_score`**, not stored. Reuse `tier_for(score, spec)` in `backend/scripts/impact_scoring.py:~63` with `tier_cutoffs`/`tier_labels` from `backend/data/impact_forecaster_spec.json:~230`. So the SQL must also SELECT `p.impact_score`. (Consistent with `nightly_rank_refresh.py:1119` `tier_for(float(sc), spec)`.) Load the spec once at module import.
4. **SQL SELECTs**: every path selects `p.llm_novelty_score` — add `p.impact_pct, p.impact_score` alongside at `~690, 790, 816, 923, 1061, 1089`.
5. **`impact_min` filter**: mirror `novelty_min` (param `~line 565`; filter applied `~894/999` as `p.llm_novelty_score >= $N`). Add `impact_min: Optional[int] = Query(None, ge=0, le=100)` → `p.impact_pct >= $N`. NOTE `impact_pct` is NULL on unscored papers so `>=` naturally excludes them (good).
6. **`sort='trending'`**: currently a composite (`~line 1032`: `0.5*paper_quality + 0.3*novelty + 0.2*citation_velocity`). Change it (or add `sort='rising'`) to `ORDER BY p.impact_pct DESC NULLS LAST`. Decide: repurpose 'trending' vs add 'rising'. The default sort is still `rank_score DESC` (`~line 1021`) — leave that for now; flipping the default headline to impact is a later slice (it touches web hero/detail too).
7. Tests: `backend/tests/` (note `test #24` referenced a "watch-preview impact_pct" test — check `test_public.py`/`test_watches.py` for shape assertions to update). Run `pytest -q --cov=api --cov-fail-under=50` + `ruff check --select E9,F63,F7,F82 .` (the backend-ci gate).
8. **Deploy backend** via the SAFE pattern (see memory `scholar-feed-backend-deploy.md` — the local `heroku-deploy` branch is STALE): `git fetch heroku main`; `git worktree add --detach /tmp/sf-deploy $(git rev-parse FETCH_HEAD)`; apply your change at root paths (a `git diff` of your dev commit applies with `git apply -p2`); py_compile + ruff; commit; `git -C /tmp/sf-deploy push heroku HEAD:main`; verify `/health`; `git worktree remove`. Also land it on master via PR (don't deploy from a stale branch — that's what clobbered PR #25).

### Part B — MCP client: pass through + document
Repo: `scholar-feed-mcp`. The MCP forwards params to the backend and returns its JSON, so once Part A lands, impact fields flow automatically — but:
1. `src/tools/search.ts`: add an `impact_min` zod param (mirror `novelty_min` at `~line 54`, pass-through at `~line 190`). Update the tool description (`~line 23`, `~143`) to list `impact_pct`/`impact_tier` in the lean shape and document `sort='trending'/'rising'`→impact.
2. `src/tools/get_paper.ts`: update the lean-shape description (`~line 27`) to include `impact_pct`/`impact_tier`.
3. Confirm no client-side field allow-listing strips the new fields (check how `fields`/lean is enforced — likely server-side, so fine).
4. Tests + `npm run build`.
5. **Publish**: npm is tag-triggered OIDC CI (no local login) — bump version, tag, push (see memory `distribution-discovery-prep.md` / `scholar-feed-build-state-and-signals.md`). The hosted MCP (Vercel, `mcp.scholarfeed.org/mcp`, entrypoint `src/server.ts`) auto-deploys from main.

### Part C — (later, separate slices, not this one)
- Web: hero `NoveltyBadge` → impact tier; paper-detail retire `RankScoreBadge`; personalized feed → impact tier.
- Email already leads with Rising (`unified_email.html`).
- Retire `rank_score` once nothing reads it.
- Optional: recalibrate novelty (feed `llm_novelty_percentile` into the forecaster to de-saturate the 0.55 pile).

## Open decisions for the next session
1. `sort`: repurpose `'trending'` → impact, or add `'rising'` and leave 'trending' as the composite? (Recommend: make `'trending'` = impact_pct for one clear knob; the old composite is half-novelty anyway.)
2. Expose raw `impact_score` in the API or only `impact_pct`+`impact_tier`? (Recommend: only pct+tier; keep score internal.)
3. Flip the **default** search sort from `rank_score` → `impact_pct` now, or defer with the web work? (Recommend defer — keep blast radius small; this slice just *adds* impact, doesn't remove rank_score yet.)

## Verification when done
- `curl '.../public/papers/search?q=...'` returns `impact_pct`+`impact_tier` in lean results; `&impact_min=80` filters; `&sort=trending` orders by impact.
- MCP `search_papers` (via the connected server) returns the fields; `impact_min` works.
- `/health/freshness` still green for `impact_pct_coverage`.
