# Scholar Feed — Watch Tool Surface (Pro hook)

Status: **draft for review** · Owner: @YGao2005 · Last updated: 2026-06-01
Related: [`limits-spec.md`](./limits-spec.md) (1 watch free / several Pro)

The single strongest recurring-value feature: standing alerts that turn the library from
a passive bookmark store into an engine that watches the field _for you_. Works for every
ICP — engineers get "what shipped that I care about," researchers get "who's building on
my niche," teams get a shared radar — and it's the bridge between the agent and the email
digest we already ship.

---

## 1. Concept — a watch is a saved search

**One-sentence model:** a watch is a persisted `search_papers` query, evaluated daily
against newly-indexed papers, that surfaces new matches via (a) the email digest and
(b) an in-session pull tool. Nothing about matching is new — it reuses the search engine
the agent already knows how to drive.

That gives us the whole seed space for free, because it's just `search_papers`'
parameters:

| Watch kind | Seed (search_papers params) | Defensibility |
|---|---|---|
| **Collection neighborhood** ⭐ | `collection_name` + `novelty_min` | **Moat** — uses our derived neighborhood + novelty score; no free substitute |
| Topic | `q` + `novelty_min` | Replicable (Google Scholar alerts) — fine, but not the draw |
| Citation watch | `scope_to_citations_of` (a paper, or a collection's papers) | Moat-ish — our citation graph |
| Similar-to-anchor | `anchor_paper_id` | Differentiated by our embeddings |
| Author | `find_author` id | Replicable |
| Category firehose, filtered | `category` + `novelty_min` | The `novelty_min` filter is the value |

> **Lead with the collection-neighborhood + `novelty_min` watch.** A keyword alert is a
> commodity (Scholar alerts exist). "New _novel_ work near everything I've saved in
> 'KV-cache'" is the defensible, personalization-powered version — it's the one that
> needs our graph + novelty scoring, and the one that pays off the library investment.

---

## 2. Tool surface (4 tools)

Keep it minimal — the surface is already 17 tools. All require `SF_API_KEY` (watches are
account-bound). Style matches the existing write tools: idempotent, get-or-create by name,
clean error copy.

### `create_watch` — MUTATES, get-or-create by name

Define a standing watch. Get-or-create by `name` (like `create_collection`): re-creating
with an existing name returns the existing watch unchanged — never errors on duplicate.
Editing a watch's definition is out of scope for v1 (delete + recreate); `update_watch`
is a future addition.

```
name           string   required   Label, e.g. "novel KV-cache work".
novelty_min    number   0..1       Only surface papers at/above this novelty. Default 0.5.
                                    THE signal/noise knob — push it up for the ICP that
                                    wants "only tell me when it matters".
# exactly-one-of seed (mirrors search_papers):
q                  string          Semantic/keyword topic seed.
collection_name    string          Watch the neighborhood of a collection ⭐ (or collection_id).
collection_id      string
anchor_paper_id    string          Watch papers similar to this one.
scope_to_citations_of string       Watch new papers citing this paper.
author_id          string          Watch an author's new work.
category           string          Watch a category, filtered by novelty_min.
```

Enforces the watch cap (1 free / several Pro). Error copy on the wall:
`Free tier includes 1 watch. Pro lets you track more — scholarfeed.org/upgrade`

### `list_watches` — read-only

Enumerate the user's watches with: `name`, a one-line definition summary,
`last_evaluated_at`, and `pending_hits` (count new since last digest delivery). Use before
`create_watch` to see what's already tracked.

### `check_watches` — read-only, idempotent (the in-session pull)

Return new matching papers since the last digest delivery, in the same shape as
`search_papers` results. Optional `watch_name` / `watch_id` to scope to one watch; omit for
all. **Does not mutate** — the "seen" watermark is advanced only by digest delivery (see
§3), so this is safe to call repeatedly (no agent-hostile mark-on-read). This is what makes
watches feel alive in the editor: "anything new on my watches?" at the start of a session,
not just in email.

### `delete_watch` — MUTATES, idempotent

Remove a watch by `name` or `id`. Deleting a non-existent watch is a no-op (no error).

---

## 3. Delivery & watermark semantics

Two delivery paths, one watermark:

- **Passive (push):** watch hits become a section of the email digest. Cadence rides the
  digest tier — monthly free / weekly trial / weekly+on-demand Pro (see limits-spec §2.1).
- **Active (pull):** `check_watches` lets the agent fetch accumulated hits any time,
  in-session. For a free user on a monthly digest, this is how they see hits between
  emails — a nice Pro lever (free pulls manually or waits for monthly; Pro gets weekly
  push automatically).
- **Watermark:** each watch tracks `last_delivered_at`. **Only digest delivery advances
  it.** `check_watches` reads "new since `last_delivered_at`" without moving it — so the
  pull is idempotent and the digest stays the canonical delivery event. (Alternative if
  in-session ack is wanted later: an explicit `acknowledge_watch_hits(watch, up_to)` — out
  of scope for v1.)

Evaluation is a **daily server-side batch** (papers index daily): for each watch, run its
saved query over papers indexed since `last_evaluated_at`, keep those at/above
`novelty_min`, append to the watch's pending set.

---

## 4. Limits & cost integration

- **Count cap is the cost control.** A semantic watch costs one Gemini query-embed per
  daily evaluation. 1 free watch = +1 embed/user/day (negligible); several Pro watches =
  a few/day. The watch-count cap (limits-spec §2) bounds this directly — no separate quota
  needed. Non-semantic seeds (citation/author/category) are pure DB → flat.
- **No pool debit for the daily evaluation** — it's our scheduled batch, not a user call.
  `check_watches` and `list_watches` debit the pool like any read (weight 1 — they're DB
  reads against precomputed pending sets).
- The cap wall is a clean upgrade prompt at a high-intent moment (the user is trying to
  track a _second_ thing) — same pattern as the 2nd-collection wall.

---

## 5. Open questions

1. **Several = how many** Pro watches? (limits-spec §6.4 — start ~10, soft.)
2. **Digest section design** — one merged "new on your watches" section, or one per watch?
   Per-watch is clearer at low counts; merge+dedup above N.
3. **Dedup across watches** — a paper matching 2 watches should appear once in the digest,
   labeled with which watches caught it.
4. **Backend:** evaluation batch job + `watches` table (`id, user_id, name, query_json,
   novelty_min, last_evaluated_at, last_delivered_at`) + pending-hits store. Not in this
   repo.
5. **`update_watch`** — defer to v2, or include now? (Delete+recreate covers v1.)
