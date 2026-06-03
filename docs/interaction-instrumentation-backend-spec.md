# Interaction Instrumentation — Backend Spec

**Status:** proposed · **Date:** 2026-06-02 · **Repo:** backend (api.scholarfeed.org), not this client
**Companion change (shipped here):** `src/client.ts` now stamps every request with an `X-SF-Session` UUID.

## Why

We want to know *who is using the product, what job they're hiring it for, and
whether they'd pay* — the prerequisite for the broader-ICP decision, not a
side-quest. The honest finding from auditing the live DB: **we already built the
skeleton and it's dormant or lossy.** This spec finishes the wiring. It is
*enrichment*, not a new tracking system.

## What already exists (audit, 2026-06-02)

| Table | Rows | State |
|---|---|---|
| `api_request_log` | ~1.5k | Per-call analytics log written best-effort by middleware in `main.py`. Has `tool, auth_type, account_id, status_code, client_hash`. **No payload** (no query text, paper id, result count). >50% of rows have `tool = null`; only `search/trending/similar/citation_scoped` are ever tagged. |
| `api_key_usage` | ~5.5k | Quota/billing audit (`key_id, endpoint, status_code`). Source of truth for billing — **leave it alone.** |
| `feature_usage_daily` | **0** | Rollup table `(user_id, feature, day, count)` — designed, never populated. |
| `user_interactions` | 67 | `(paper_id, interaction_type, dwell_time_seconds)`; types seen: save/like/read/skip. `dwell_time` null on every row. Effectively dead; web-app vestige. |

Two gaps fall out: **(1)** we discard the semantic payload on every call, and
**(2)** we are blind to usage of our most differentiated tools (`find_author`,
`co_author_graph`, `get_foundational_lineage`, `find_gaps`, `get_paper`) because
they land in the `null` bucket.

**This is a capture problem, not a storage problem.** At ~1.5k rows, do not reach
for a warehouse / PostHog / ClickHouse. The efficient design is already latent:
one JSONB column on the existing log + the existing 90-day eviction + the
existing (empty) daily rollup. Revisit external analytics only if raw rows cross
~10–50M/yr — years away at current traffic.

---

## P0 — Capture the payload + fix tool tagging  *(the whole ballgame)*

### Migration

```sql
alter table public.api_request_log
  add column if not exists detail     jsonb,   -- semantic payload, allowlisted tools only
  add column if not exists session_id uuid;    -- from X-SF-Session header (see P1)
-- No GIN index yet. Add one only once we actually query into `detail`:
--   create index concurrently on api_request_log using gin (detail);
```

### Middleware (`main.py` logging path)

1. **Tag every route with a `tool`.** Eliminate the `tool = null` bucket — every
   MCP route maps to exactly one tool name (`find_author`, `co_author_graph`,
   `get_foundational_lineage`, `get_paper`, `fetch_fulltext`, `ask_library`,
   `find_gaps`, watch tools, collection tools, …). This alone fixes our blindness
   to the moat tools and is just route labeling.

2. **Populate `detail` for an allowlist only** (keep the rest null — cheap, and
   avoids logging noise/PII-ish bodies we don't need):

   | tool | `detail` shape | why |
   |---|---|---|
   | `search_papers` | `{ "q": <str>, "result_count": <int>, "empty": <bool>, "filters": {…} }` | the core intent signal; **`empty=true` is demand we're failing to serve** |
   | `get_paper` / `fetch_fulltext` | `{ "paper_id": <str> }` | which papers actually get pulled |
   | `find_author` / `co_author_graph` | `{ "entity": <str> }` | usage of the differentiated tools |
   | `find_gaps` / `get_foundational_lineage` / `get_field_orientation` | `{ "anchor": <str> }` | same |

   Write `detail` from the already-parsed request/response — do **not** add a
   second DB round-trip; keep it on the existing best-effort background write so
   it adds no latency to the call.

3. **Store `session_id`** = the `X-SF-Session` request header (validate as UUID,
   else null). The client already sends it on every request; non-MCP/direct-API
   callers simply won't, hence nullable.

### Privacy posture (deferred, but cornered safely)

Raw query text is logged for now — it's the most useful signal and we're
pre-enterprise. The one hedge: **gate raw `detail.q` behind a single config flag**
(`LOG_QUERY_TEXT=true`) and **make no ToS/marketing claim that contradicts it.**
When the first enterprise deal needs it off, it's a one-line flip — not a
migration and an apology. (A VC's query reveals their thesis; a litigator's
reveals case strategy — this *will* come up if we move up-market.)

---

## P2 — Wire the rollup  *(permanent, queryable, survives 90-day eviction)*

`feature_usage_daily` already exists and is empty. One idempotent nightly job
aggregates the raw log into per-(account, tool, day) counts. This is the layer
dashboards read; raw rows can then be evicted at 90 days without losing trend.

```sql
-- Ensure the upsert target exists (verify before relying on ON CONFLICT):
--   alter table public.feature_usage_daily
--     add constraint feature_usage_daily_pk primary key (user_id, feature, day);

insert into public.feature_usage_daily (user_id, feature, day, count)
select account_id, tool, called_at::date, count(*)
from public.api_request_log
where account_id is not null
  and tool is not null
  and called_at::date = (current_date - 1)
group by account_id, tool, called_at::date
on conflict (user_id, feature, day)
do update set count = excluded.count;
```

Schedule via `pg_cron` (~03:00 UTC daily). Backfill once for existing rows by
looping the `where` over past dates.

---

## P3 — Decide `user_interactions`'s fate  *(product call)*

It's the only home for `read`/`skip` view signals, but it's dead (67 rows,
dwell always null) and overlaps dedicated tables (`collection_papers`, likes).
Two clean options:

- **(A) Retire it.** Saves/likes/collections are already first-class; "views" in
  an agent world are better derived from `api_request_log` (`get_paper` calls,
  deduped by `session_id`). Drop the table.
- **(B) Make it canonical.** Feed it from MCP (`get_paper`→read, `save_paper`→save,
  `like_paper`→like) keyed by `session_id`, and **drop `dwell_time_seconds`** —
  there is no dwell concept for an agent fetch; it's web-app vestige.

Recommendation: **(A)** unless we want an explicit cross-surface (web + MCP)
interaction ledger. The `session_id`-deduped `get_paper` count gives us "views"
without a second write path.

---

## The session-id problem this all rests on

An agent reasoning loop can call `get_paper` 30× for one human task. Without a
session id, every "view" metric is inflated by fan-out and **the numbers lie.**
The client now sends a stable per-process `X-SF-Session` UUID (one stdio process
≈ one session); the backend stores it (P0 step 3) so any view/usage count can be
collapsed to real sessions: `count(distinct session_id)` ≫ `count(*)`.

## Rollout order

1. ✅ **Client** — `X-SF-Session` header (shipped in this repo; forward-compatible, harmless before the backend reads it).
2. **P0 migration** — add `detail`, `session_id`.
3. **P0 middleware** — tag all tools + populate `detail` + store `session_id`.
4. **P2** — PK check + nightly `pg_cron` rollup + one-time backfill.
5. **P3** — decide retire vs. canonicalize `user_interactions`.

## What this unlocks

After ~2–4 weeks of enriched data: top queries, empty-result gaps (unmet demand),
which tools actually get used (is the moat used?), per-account funnels
(trial→activation→repeat→convert), and the raw material for "trending in field X."
That dataset answers the broaden-the-ICP question with evidence instead of
intuition — pick the beachhead from the query log, not a guess.
