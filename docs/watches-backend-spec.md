# Scholar Feed — Watches Backend Spec

Status: **draft for review** · Owner: @YGao2005 · Last updated: 2026-06-01
Related: [`watch-tool-spec.md`](./watch-tool-spec.md) (MCP surface), [`limits-spec.md`](./limits-spec.md) (caps)

**This lives on Supabase/Heroku, not in the `scholar-feed-mcp` repo.** This doc is the
contract the MCP `watches.ts` tools call, plus the schema + eval job whoever builds the
backend implements. Base URL matches the rest of the API: `https://api.scholarfeed.org/api/v1`.

---

## 1. Tables (Supabase / Postgres)

```sql
create table watches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  name            text not null,
  novelty_min     real not null default 0.5,         -- signal/noise floor
  seed            jsonb not null,                     -- the search_papers query (see §3)
  last_evaluated_at timestamptz,                      -- advanced by the eval job
  last_delivered_at timestamptz,                      -- advanced ONLY by digest delivery
  created_at      timestamptz not null default now(),
  unique (user_id, lower(name))                       -- get-or-create by name
);

create table watch_hits (
  watch_id    uuid not null references watches(id) on delete cascade,
  paper_id    uuid not null references papers(id),
  matched_at  timestamptz not null default now(),     -- when the eval job caught it
  score       real,                                   -- relevance at match time (for ordering)
  primary key (watch_id, paper_id)                    -- dedupe: a paper matches a watch once
);
create index on watch_hits (watch_id, matched_at);
```

Notes:
- `unique (user_id, lower(name))` enforces get-or-create-by-name at the DB layer (mirrors
  collections). The MCP `create_watch` relies on this — re-creating a name returns the row.
- `watch_hits` PK dedupes a paper within a watch. Cross-watch dedup (a paper matching two
  watches) happens at **digest assembly** (§4), not here.
- The watch-count cap (1 free / several Pro, limits-spec §2) is enforced on `POST /watches`
  by counting the user's rows before insert.

## 2. API contract (what the MCP tools call)

| MCP tool | Method + route | Body / params | Returns |
|---|---|---|---|
| `create_watch` | `POST /watches` | `{name, novelty_min, seed:{...}}` | `201 {watch}`; on duplicate name returns the existing watch (get-or-create, never 409 to the client) |
| `list_watches` | `GET /watches` | — | `{watches: [{id, name, summary, novelty_min, last_evaluated_at, pending_hits}]}` |
| `check_watches` | `GET /watches/hits` | `?watch_id=` (optional), `?limit=` | `{hits: [paper...], since: last_delivered_at}` — **read-only, does not advance any watermark** |
| `delete_watch` | `DELETE /watches/{id}` | — | `204` (idempotent — deleting a missing watch is still `204`/no-op) |

`pending_hits` = `count(watch_hits where matched_at > coalesce(last_delivered_at, '-infinity'))`.

**Cap enforcement error** (so the MCP relays a clean upgrade prompt): `POST /watches` past
the cap returns `403` with body `{error: "watch_limit", message: "Free tier includes 1
watch. Pro lets you track more — scholarfeed.org/upgrade", limit: 1}`. (The MCP tool
surfaces `message` verbatim.)

## 3. Seed shape

`seed` is a stored `search_papers` query — exactly one primary selector plus optional
filters. The eval job replays it against newly-indexed papers.

```jsonc
{
  "kind": "collection" | "topic" | "anchor" | "citations_of" | "author" | "category",
  // exactly one of, by kind:
  "collection_id": "uuid",        // kind=collection (resolve collection_name → id on create)
  "q": "string",                  // kind=topic
  "anchor_paper_id": "arxiv_id",  // kind=anchor
  "scope_to_citations_of": "arxiv_id", // kind=citations_of
  "author_id": "string",          // kind=author
  "category": "cs.LG"             // kind=category
}
```
`novelty_min` is stored as a column (not in `seed`) since the eval job filters on it
directly and the digest may want to show it.

## 4. Daily evaluation job (Heroku scheduler / cron)

Runs once daily, after the day's arXiv index completes. Pseudocode per watch:

```
for watch in watches:
    since = watch.last_evaluated_at ?? watch.created_at
    candidates = run_search(watch.seed, indexed_after=since)   # reuse search_papers internals
    fresh = [p for p in candidates if p.llm_novelty_score >= watch.novelty_min]
    upsert watch_hits (watch_id, paper_id, matched_at=now, score) on conflict do nothing
    watch.last_evaluated_at = now
```

- **Reuses the existing search engine** — no separate matching system. A semantic seed
  (`topic`/`anchor`/`collection`) costs **one Gemini query-embed per watch per run**; that
  is the only marginal $, and the watch-count cap bounds it (limits-spec §3 cost model).
  Non-semantic seeds (`citations_of`/`author`/`category`) are pure DB → flat.
- `on conflict do nothing` makes re-runs idempotent — a paper already caught isn't
  re-added or re-notified.
- Bounded blast radius: with 1 free / ~10 Pro watches, worst-case daily embeds per user are
  tiny. No per-watch quota needed beyond the count cap.

## 5. Delivery & watermark (the one rule that matters)

- The **digest** is the canonical delivery event. When a user's digest is assembled, pull
  `watch_hits where matched_at > last_delivered_at`, **dedupe across the user's watches**
  (a paper caught by two watches appears once, labeled with both), render the "New on your
  watches" section, send, then set `last_delivered_at = now` for those watches.
- `check_watches` (`GET /watches/hits`) reads the same `matched_at > last_delivered_at`
  window **without advancing `last_delivered_at`** — so it's idempotent and safe to retry
  (consistent with `save_paper`'s self-correcting design). It's a preview of the next
  digest; hits persist until the digest actually delivers them.
- Cadence rides the digest tier (monthly free / weekly trial / weekly+on-demand Pro,
  limits-spec §2.1). Free users see accumulated hits via `check_watches` between monthly
  emails — a natural Pro lever.

## 6. Open questions

1. Should `check_watches` optionally **ack** (advance `last_delivered_at`) via an explicit
   flag, for users who live in the agent and rarely open email? Deferred — would break the
   "digest is canonical" invariant; revisit if pull-usage dominates.
2. **Retention** of `watch_hits` — prune rows older than N months to bound table growth.
3. **Eval job backfill** on `create_watch`: evaluate immediately against the last ~7 days
   so a new watch isn't empty until tomorrow's run? (Nice first-run UX; small cost.)
