# Scholar Feed — Free / Pro Limits Spec

Status: **draft for review** · Owner: @YGao2005 · Last updated: 2026-06-01

This spec defines the free-vs-Pro tier boundaries for the Scholar Feed MCP + web +
digest surfaces. It exists to be implemented against; numbers marked _(calibrate)_ are
placeholders pending real per-call cost data.

---

## 1. Principles

These four rules decide every number below. When a future limit question comes up,
re-derive from these rather than guessing.

1. **Charge for the verbs, not the nouns.** Saving is cheap, habit-forming, and
   generates the personalization signal that powers For You + the digest (which benefits
   _us_). The recurring value — and our real marginal LLM cost — lives in the operations
   that _act on_ the library: watch, digest, ask-my-library, gap-check. Price those.

2. **Deep but bounded.** Free must be generous enough to fall in love in one session,
   bounded enough that habitual/recurring use requires paying. Tighten the
   _stateful and recurring_ axes (caps + cadence + synthesis verbs), not the
   first-session read experience (the demo + funnel).

3. **Gate where the wall is a clean upgrade prompt.** Block at high-intent moments where
   the error message reads as _"upgrade to continue"_ and the agent relays it naturally
   (e.g. creating a 2nd collection). Never gate where the failure surfaces mid-task as a
   broken half-answer (e.g. a raw rate-limit error part-way through a lit review).

4. **Meter by cost × defensibility.** A tool with a free substitute (websearch, raw
   arXiv) should be cheap/frictionless — metering it just routes usage to the substitute
   and makes our tool look worse. Reserve real scarcity for things that cost us _and_
   that have no substitute (the derived graph products) or that devs would otherwise
   resell (`embed_text`).

---

## 2. Tier matrix

| Axis | Anonymous | Free + account | Pro |
|---|---|---|---|
| Daily read pool (credits) | 75 _(calibrate)_ | **200** _(calibrate)_ | **Unlimited** (fair-use — see §3.3) |
| `embed_text` (separate hard cap) | 0 | **20 / day** | **~500 / day** _(calibrate)_ — _not_ unlimited |
| Save to library | — (read-only) | **50 papers** | unlimited |
| Collections | — | **1** | unlimited |
| Watches / standing alerts | — | **1** | several _(calibrate)_ |
| Digest cadence | — | monthly (+ weekly for first 30 days — see §2.1) | weekly + on-demand |
| Ask-my-library / gap analysis | — | — | ✅ |
| Exports (Obsidian/Notion/BibTeX) | — | basic | full |
| Team / shared collections | — | — | ✅ (seats) |

What stays **generous on purpose**: the first-session read experience (funnel), the 10×
read-pool jump for signing up (the account is the personalization substrate — we _want_
that signup), and the three no-substitute graph tools (§4).

> Replaces the current flat caps (anon 100/day, key 1000/day). Per-minute rate limits in
> the README are **unchanged** — those are burst protection, orthogonal to monetization.

### 2.1 Email digest — gate cadence, not existence

The digest is our **only re-engagement channel**. MCP churn is silent (no in-app
notification — the user just stops opening their editor), so the digest email is the one
thing that pulls them back. Gating it entirely behind Pro would kill the retention loop
_and_ the conversion surface. So gate the **cadence/richness**, not existence — same
"show, don't fully give" pattern as the 1-collection cap:

- **Free baseline: monthly digest** — permanent. Cheap (one email + at most one LLM
  synthesis per user per month) and it's the heartbeat that keeps free users alive.
- **Trial: weekly digest free for the first 30 days** of having an account — automatic,
  no card. They feel the good version and build the habit; the _last free weekly email_
  carries the "keep weekly → upgrade" CTA. The drop back to monthly is a loss-aversion
  conversion moment (converts harder than never having given it).
- **Pro: weekly + on-demand**, permanently.

Mechanism: a `plan` state (`free` / `trialing` / `pro`) + `trial_ends_at` on the account;
the digest cron picks cadence from `(plan, trial_active)` per user. Auto-start the trial
on signup (passive — they just start receiving the good emails); no payment step until
they convert.

---

## 3. The weighted credit pool

One daily pool per account, debited per call by the tool's weight. One number for the
agent to reason about; retune by changing a weight, not a counter.

> **Cost model.** Infra is flat: Supabase + Heroku don't bill per call — heavy usage eats
> shared dyno/DB capacity until we're forced to bump a tier (a step cost, not a per-call
> one). The _only_ genuine marginal $ is **Gemini**: `embed_text` is a raw passthrough,
> and `search_papers` / `find_author` / `get_field_orientation` each embed their query
> once. (Check whether `fetch_fulltext` extracts via LLM — if so it's metered too;
> if it's deterministic LaTeX parsing, it's flat.) So the pool's job is **(1) ration
> shared flat capacity** so one user can't degrade everyone / force a premature scale-up,
> and **(2) contain Gemini** — which is why `embed_text` is carved out and capped even on
> Pro. The weights below rank "capacity load + Gemini exposure," not dollars.

| Tool | Weight | Rationale |
|---|---:|---|
| `get_paper` | 1 | Pure DB retrieval (incl. batch + bibtex). Commodity; substitute is free, but so is serving it. |
| `get_citations` | 1 | DB graph lookup. Commodity. |
| `get_field_orientation` | 1 | Cheap retrieval, **no substitute** (derived). Already "no Pro quota" — keep generous. |
| `get_foundational_lineage` | 1 | Citation-graph traversal, **no substitute**. Already "no Pro quota" — keep generous. |
| `search_papers` | 3 | Query embedding + vector search. Partly differentiated by novelty ranking. |
| `find_author` | 3 | May embed the query. |
| `co_author_graph` | 3 | Live graph derivation; **no substitute**. |
| `fetch_fulltext` | 3 | Heavy to serve, **but substitutable by websearch** — do not tax it (see §3.1). |
| `embed_text` | — | **Not in the pool.** Separate hard cap (§3.2). |

At a 200-credit pool, that's ≈ 66 searches, _or_ ≈ 66 full-text reads, _or_ 200 lookups,
freely mixed. A runaway loop drains _its own_ day, not our wallet.

### 3.1 `fetch_fulltext` — quality, not quota

It is both the most expensive to serve _and_ the most substitutable (an agent can get raw
paper text via websearch). Taxing it is the worst move: we'd eat the cost _and_ push
usage to the substitute. So weight it low (**3**) and let the **quality of extraction**
decide its fate:

- **If we win on quality** — clean, sectioned results/experiments pulled from LaTeX source
  vs. the raw PDF/HTML blob websearch returns — agents prefer it despite the substitute,
  and the low weight just removes friction from something people want. Good outcome.
- **If we can't beat websearch on quality** — it's a thin convenience. Keep the low weight,
  don't invest further; demand self-limits because agents route bulk-text needs to
  websearch anyway. The 10/min rate limit already bounds the blast radius.

Either way the lever is extraction quality, not the credit weight. Flagged as a
**margin-trap watch item**: never let our most-expensive-to-serve tool also be our
least-defensible without a quality story.

### 3.2 `embed_text` — carved out

Pulled from the pool and given a hard **20/day** cap on free. It's a developer primitive
(HyDE, custom similarity) — no end-user in the broadened ICP (engineers/founders/
enthusiasts) ever calls it directly. Its free usage skews toward people building on top of
the API, i.e. reselling our Gemini passthrough. The small allowance keeps legitimate
agent query-expansion working; the hard cap stops anyone treating us as a free embedding
API and makes it the first thing that nudges devs to Pro.

### 3.3 Pro: "unlimited," mechanically

"Unlimited" is the right word for the pool and it's _honest_ — backed by fair-use + the
per-minute rate limits, not a marketing fiction. Implement it as:

- **No daily pool debit on the pooled tools**, with a very high _soft_ ceiling
  (≈5,000 credits/day — _calibrate_) that only abuse ever touches. The per-minute rate
  limits (README, unchanged) are the real bound: `search` at 30/min, `fetch_fulltext` at
  10/min, etc. mathematically cap the daily worst case far below anything a human research
  session reaches — so "unlimited" costs us nothing for legitimate use.
- The soft ceiling is an **abuse lever, not a user-facing limit**. A Pro key is a juicier
  abuse target than a free key (a leaked/shared key running 24/7 could run a service on
  our dime; per-minute limits cap _throughput_ but not _duration_). The ceiling flags for
  review without breaking the promise for 99.9% of users.
- Back the word with a **fair-use clause** in the ToS/pricing copy, so throttling a
  genuine abuser later is not a broken promise.

**The one exception: `embed_text` stays capped on Pro** (~500/day — _calibrate_), _not_
unlimited. It's a direct Gemini-$ passthrough and a resale vector — "unlimited" there
turns a Pro key into a free uncapped embedding API. Set it high enough that normal use
never feels it and market it as _"no practical limit"_; reserve the literal word
"unlimited" for the pool.

---

## 4. What is never metered

`get_field_orientation`, `get_foundational_lineage`, and (to the extent its cost allows)
`co_author_graph` are our **derived graph products** — there is no free substitute. Per
Principle 4 they are safe to keep generous _because_ that's the reason to be here. They
are the "deep free floor" that lets a free user have an impressive first session without
touching the metered surface. Keep their pool weight at 1 (or unmetered) and never gate
them behind Pro quota.

---

## 5. Enforcement & error copy

Each wall must return a message the agent will relay as a clean upgrade prompt
(Principle 3). Proposed copy:

| Wall | Where enforced | Error copy |
|---|---|---|
| Daily pool exhausted | Backend quota (per account/day) | `Daily research quota reached (free tier). It resets at {reset}. Pro removes this limit — scholarfeed.org/upgrade` |
| `embed_text` cap | Backend, separate counter | `Free embedding limit reached (20/day). Pro raises this — scholarfeed.org/upgrade` |
| 51st save | Tool-level (`save_paper`, `add_to_collection`) | `Library is full (50 papers, free tier). Remove one or upgrade for unlimited — scholarfeed.org/upgrade` |
| 2nd collection | Tool-level (`create_collection`, `add_to_collection` get-or-create path) | `Free tier includes 1 collection. Pro gives unlimited collections — scholarfeed.org/upgrade` |
| 2nd watch | Tool-level (watch create) | `Free tier includes 1 watch. Pro lets you track more — scholarfeed.org/upgrade` |

Implementation notes:

- The **collection-create path is the high-intent block**, not the save path. Because the
  library is a superset of collections, `add_to_collection` can trip _both_ the 50-save
  cap and the 1-collection cap — make sure the collection cap is checked on the
  get-or-create branch so a user trying to file into a _new_ topic sees the collection
  message (the better upgrade trigger), not the save message.
- Pool debits happen **server-side** on the authenticated request; the MCP tools surface
  whatever the backend returns. Don't try to count in the client.
- Return the quota state in response headers (extend the existing
  `X-RateLimit-*` family with `X-Quota-Remaining` / `X-Quota-Reset`) so well-behaved
  agents can self-pace before hitting the wall.

---

## 6. Open calibration questions

Resolve these before locking numbers:

1. ~~**Real per-call cost** for `search_papers`, `fetch_fulltext`, `embed_text`.~~
   **Reframed (see §3 Cost model):** infra is flat (Supabase/Heroku), so there's no
   meaningful per-call cost to recover. Only two inputs are needed:
   (a) **Gemini's published embedding price** → sets the `embed_text` caps (20 free /
   ~500 Pro); (b) **the Heroku/Supabase capacity ceiling** (≈ requests/day before a
   forced dyno scale-up) → sizes the 200 pool and the ~5,000 Pro soft ceiling.
   `fetch_fulltext`: **almost certainly flat** — it returns char-truncated raw sections
   (800/3000 chars) + table captions, not summaries, which is the signature of
   deterministic LaTeX parsing, not LLM extraction. Weight 3 stands. (Confirm against the
   backend `/public/papers/{id}/fulltext` route — that's the one piece not in this repo.)
2. **Anonymous pool size** (75?) — large enough for one impressive session, small enough
   that the signup jump is meaningful.
3. ~~**Pro pool** — hard high cap vs. soft/fair-use.~~ **Resolved (§3.3):** unlimited
   fair-use, ~5,000-credit soft ceiling as an abuse lever, `embed_text` capped at ~500/day.
   Remaining: confirm the soft-ceiling and `embed_text`-Pro numbers against cost data.
4. **Watch count on Pro** and digest on-demand frequency — depends on digest infra cost.
5. ~~**Grandfathering**: existing 1,000/day key holders.~~ **Resolved:** migrate straight
   onto the new free pool at launch, no grace window. It's a free→free move, cheapest to
   absorb pre-launch while the base is small; frame it as a feature launch ("here's what
   Pro now adds"), not a takeaway. Copy drafted — §7.

---

## 7. Launch copy (drafts)

### 7.1 Migration notice (to existing key holders)

Framed as a launch, not a takeaway. The old 1,000/day flat cap becomes the free pool +
new library/collection/watch features; Pro is the new thing on top.

> **Subject:** Scholar Feed just got collections, watches, and a Pro plan
>
> Your API key now does more than search. You can save papers, organize them into
> collections, and set **watches** that surface new work in your areas — all from your
> editor, all synced to your For You feed and digest.
>
> What changes for you: the old per-day call limit is now a single daily **research pool**
> (200 credits — a typical session is well under that), and saving/collections/watches are
> live on your account today. Cheap lookups barely touch the pool; only Gemini-backed
> embedding calls are metered separately.
>
> Want unlimited research, unlimited collections, more watches, and a weekly digest?
> **Pro** is live at scholarfeed.org/upgrade. Nothing you have today goes away.

Tone check: leads with _gain_ (new features), states the pool as an upgrade from a cruder
cap, mentions Pro last, and explicitly reassures ("nothing goes away") to neutralize
loss-aversion on the cap change.

### 7.2 Digest trial CTA (last free weekly email, before drop to monthly)

Fires in the final weekly digest of the 30-day trial. Loss-aversion is the mechanic — they
now know what weekly feels like and are about to lose it.

> **Banner at top of the email:**
> This is the last of your weekly digests — starting next week, free accounts get the
> digest monthly. Keep it weekly (plus on-demand, unlimited research, and more watches)
> with **Pro → scholarfeed.org/upgrade**.
>
> **Footer reinforcement:**
> You've gotten 4 weekly digests during your trial. Don't want to drop to monthly?
> Pro keeps them coming every week — scholarfeed.org/upgrade.

Optional softener if churn-risk outweighs conversion: instead of dropping to monthly
silently, send the first monthly digest with a "you're now on monthly — go weekly anytime"
note, so the downgrade itself becomes a second conversion touch.
