# Scholar Feed — Saved-Papers Roadmap & Scoping Brief

Status: **scoping entry point** · Owner: @YGao2005 · Last updated: 2026-06-01

**Purpose.** This is the single orienting doc for a fresh session tasked with scoping
*exactly what to build next* in the saved-papers / personalization feature area. Read this
first, then the linked specs. The goal of that session: produce a **prioritized,
backend-effort-aware build plan** for the next 1–2 Pro features, each with a backend
handoff spec.

## Read next
- [`limits-spec.md`](./limits-spec.md) — free/Pro tiers, the weighted credit pool, digest
  trial, migration, and the four pricing principles.
- [`watch-tool-spec.md`](./watch-tool-spec.md) + [`watches-backend-spec.md`](./watches-backend-spec.md) — the watch verb.
- [`gap-analysis-spec.md`](./gap-analysis-spec.md) — the `find_gaps` verb.

## Product context (decided)
- **ICP is broader than researchers** — engineers, founders, AI enthusiasts (researchers a
  subset). Two value axes: researchers pay for **depth/rigor** (lineage, full-text, gaps);
  eng/founders pay for **synthesis/timeliness** (digests, alerts, ask, prior-art checks).
- **Monetization:** free/Pro split. Core insight: the saved **library is the substrate**;
  you monetize the **verbs that run on it**, not the saving.
- **Four principles:** (1) charge for verbs not nouns; (2) free is deep-but-bounded
  (tighten stateful/recurring axes, keep the acquisition funnel generous); (3) gate where
  the wall is a clean upgrade prompt (e.g. 2nd collection), never mid-task; (4) meter by
  **cost × defensibility** — be generous where there's no substitute (the graph products),
  cheap where a free substitute exists (raw fulltext via websearch), scarce only where it
  costs you *and* devs would resell it (`embed_text`).

## What's built (and what's inert)

| Verb | Version | Client | Backend | Status |
|---|---|---|---|---|
| save / unsave / like / list, collections | 3.3 | ✅ | ✅ exists | **working end-to-end** |
| watches (create/list/check/**preview/update**/delete) | 3.7 | ✅ | ✅ **deployed** (Heroku `7f3f1c0`) — v2 **structured filter** watches (collections/authors/categories/text/has_code/min_novelty/similar) + topic/collection/anchor seeds; author/category subsumed by `filter` criteria | **live + v2 + digest delivery shipped** — see [`watch-v2-structured-spec.md`](./watch-v2-structured-spec.md). The "On Your Watches" digest block, per-paper novelty badge + methodology legend, watermark, and an authenticated live smoke (first watch on the "Aiyara" collection, real send) all shipped. |
| `find_gaps` | 3.5 | ✅ | ✅ **deployed** (Heroku v382) — foundational + frontier, read-only, Pro-gated, no migration | **live**; SQL validated against prod (Supabase MCP). Pending: authenticated smoke test |
| `ask_library` | new | ✅ (committed, unpublished) | ✅ **deployed** (Heroku v388) — `GET /ask`, scoped exact-cosine retrieval + DeepSeek synthesis over `llm_summary`, no migration | **live**; free 1/mo + Pro, read-only. Retrieval SQL validated against prod; DeepSeek+Gemini keys confirmed set. Pending: an authenticated smoke test + an npm release of the client tool |
| client surfaces `{error,message}` upgrade prompts | 3.5 | ✅ | — | done (Pro gates can rely on it) |

## The binding constraint
**Backend throughput is the bottleneck, not feature ideas.** The MCP client has raced ahead
— two verbs (watch, gaps) are shipped client-side but inert. Any scoping must weigh
*backend effort*, not just desirability, and decide whether to **finish the inert verbs**
before adding new ones.

## Candidate features (the menu to scope)

| Feature | What it is | ICP value | Defensibility | Backend effort | Status |
|---|---|---|---|---|---|
| **Ask-my-library (RAG)** | Query your saved set through the agent ("answer using only my 'agents' collection") | Highest broad-ICP stickiness | High (your embeddings + their curated set) | ~~Big~~ **Medium** — it's Field Guide scoped to the library (reuses retrieval/quota/DeepSeek) | ✅ **v1 SHIPPED** (Heroku v388) — `GET /ask`, summaries, free 1/mo + Pro. See [`ask-my-library-spec.md`](./ask-my-library-spec.md) |
| **Annotations** | Notes on saved papers + "summarize my notes across X" | Enabler / journal | Low | Low (a field + endpoint) | Not started |
| **Landscape report** | Scheduled synthesis over the library ("state of my fields this month") | Founder/PM | Low now — **derive from ask** (a scheduled `ask_library` + a fixed prompt) | Not started — derivable post-ask |
| **Team / shared collections** | Shared collection all members' agents read/write | Highest ARPU | Medium | Bigger (sharing/permissions) | Different SKU — usually deferred |
| **Export** | Push library/collection to Obsidian/Notion/Zotero/BibTeX | Portability | Low | Low | Keep cheap/free (lowers lock-in objection) |
| **Reading queue / triage** | read/unread, prioritized by novelty + recent saves | Productivity | Low | Medium | Not started |

## Strategic questions for the scoping session to answer
1. Which **1–2 Pro features actually justify the subscription** for each ICP axis?
2. **Sequencing under the backend bottleneck:** finish the inert verbs (watches + `/gaps`
   backends) first, or build ask-my-library? (Finishing what's shipped beats accumulating
   more half-built verbs — but ask-my-library may be the bigger conversion driver.)
3. Does **ask-my-library subsume** landscape-report and overlap `find_gaps` into one "ask"
   surface? If so, build the general RAG and derive the others.
4. **Next shippable release bundle** — e.g. annotations + `find_gaps` as a "basics" Pro
   drop, then ask-my-library?

## Open design forks (carried over — decide during scoping)
- **gaps** (`gap-analysis-spec.md §4`): ~~subtract whole-library vs just-the-collection~~
  **RESOLVED 2026-06-01: keep per-seed subtract** (collection→its members, topic→whole
  library) — switching collection seeds to whole-library would hide cross-collection
  signal. Still open: annotate *why* each gap matters / "saved elsewhere"; bundle with
  annotations?
- **watches** (`watch-tool-spec.md §5`, `watches-backend-spec.md §6`): Pro watch count,
  digest section layout, cross-watch dedup, `update_watch`, first-run backfill.
- **limits calibration** (`limits-spec.md §6`): Gemini embedding price + Heroku/Supabase
  capacity ceiling → sets the 200 pool, ~5,000 Pro soft ceiling, and `embed_text` caps.

## Repo reality (so the fresh session doesn't waste effort)
This repo (`scholar-feed-mcp`) is a **thin stdio MCP client** that proxies to the backend.
Quota enforcement, the watches eval job, the `/gaps` endpoint, the digest cron, and all
Gemini calls live in the backend.

**CORRECTION (2026-06-01):** the backend **is** in this workspace — sibling dir
`../scholar-feed` — and is editable. It's a **FastAPI** app (`backend/api/`) on **Heroku**
(`scholar-feed-api`) + **Supabase/Postgres** (pgvector; migrations `backend/migrations/NNN_*.sql`),
Next.js frontend on Vercel. Cron jobs run via **Heroku Scheduler** (the daily
`backend/scripts/unified_email_sender.py`), not GitHub Actions. So "build a feature" can mean
editing the backend directly, not just writing a handoff spec.

Watches turned out to be **~70% pre-built** as the `alerts`/`topic_alerts` subsystem (CRUD
router, Gemini matcher, FREE=1/PRO=10 tier limits, billing `is_pro`). The watches backend
on branch `feat/watches-backend` extends it: migration 132 (seed/novelty/watermarks +
`watch_hits`), `api/routers/watches.py`, and a `watch_hits` eval pass in the matcher.
Remaining: apply migration 132 → deploy → smoke-test; then the digest "New on your watches"
section + `last_delivered_at` watermark; then the other seed kinds; then `/gaps`.

## Current branch
`feat/library-collections-watches` — bundled 3.2–3.4 commit + a clean 3.5.0 gap-analysis
commit. Working tree clean.
