# Scholar Feed — Ask-My-Library (`ask_library`)

Status: **draft for review** · Owner: @YGao2005 · Last updated: 2026-06-01
Related: [`limits-spec.md`](./limits-spec.md) (Pro/quota), [`gap-analysis-spec.md`](./gap-analysis-spec.md)
(the inverse verb), [`roadmap-and-scoping.md`](./roadmap-and-scoping.md) (candidate features).

The flagship broad-ICP Pro verb: "answer my question using my saved set." It's cheap to
build because it's **Field Guide with the retrieval scoped to the user's library** — the
heavy scaffolding (synthesis agent, monthly-quota gate, MCP poll-mode, retrieval toolkit,
DeepSeek client) already ships.

---

## 1. Concept

`ask_library` retrieves from the papers the user **has saved** (whole library or one
collection), then synthesizes a cited answer grounded *only* in that set.

**It is the inverse of `find_gaps`, not an overlap:**

| Verb | Retrieves from | Answers |
|---|---|---|
| `ask_library` | what you **have** (saved set → synthesis) | "What does my library say about X?" |
| `find_gaps` | the corpus **minus** what you have | "What am I missing about X?" |

They share a surface ("questions about my library") but opposite mechanisms. Keep both;
they're the complete pair. **`ask_library` *does* subsume landscape-report** — a "state of
my fields this month" report is just a scheduled, templated `ask_library` call (a cron + a
fixed prompt), so build `ask_library` and derive landscape-report, don't build it separately.

## 2. Why this is medium-small (the reuse map)

Nearly everything exists in the backend (`../scholar-feed`). New code is thin:

| Need | Reuse (existing) |
|---|---|
| Long-running, MCP-safe transport | `routers/field_guide.py` **poll mode** (`/start` → poll `/{id}`) — built for MCP |
| Pro / free-quota gate | `billing.require_pro_or_quota(verb, n)` + `increment_quota` — already gates `field_guide` |
| Synthesis LLM | the agent's **DeepSeek client** (`AsyncOpenAI`, `agent/retrieval.py`, `agent/field_guide.py`) |
| Query embedding | `routers/papers.get_query_embedding` (cached) |
| Vector retrieval | `agent/retrieval.py:embedding_search` pattern (+ scoped scan, see §4) |
| Saved-set / collection resolution | `gaps.py` `_SUBTRACT_LIBRARY` / `_SUBTRACT_COLLECTION` (invert to a *restrict*) |
| Paper output shape | `gaps.py:_paper_row` |
| Report persistence + history (if poll) | `field_guide_reports` table pattern |

**Genuinely new:** scoped retrieval over the saved set, the free-form synthesis prompt,
the endpoint, and the MCP client tool. Days, not weeks.

## 3. MCP tool (new — `src/tools/ask_library.ts`)

`ask_library` — requires `SF_API_KEY` (needs the library to retrieve from), Pro/quota-gated.

```
question         string   required — the natural-language question
collection_name  string   optional scope: ask within one collection (by name)
collection_id    string   optional scope: ask within one collection (by UUID)
limit            int       optional — papers to ground the answer on, 1..20 (default 8)
```

No scope seed ⇒ the **whole saved library**. Exactly-zero-or-one collection seed (mirrors
`find_gaps`). Pro/quota enforcement is the backend's job; a blocked free account gets the
`{error, message}` upgrade envelope that `client.ts` surfaces verbatim (same path as `gaps`).
For poll-mode (§5) the tool calls `/ask/start` then polls `/ask/{id}` — reuse the MCP poll
pattern Field Guide already established.

## 4. Backend contract & algorithm

Two transport options (§5 open Q); the algorithm is identical.

```jsonc
// Response
{
  "scope":     { "label": "agents", "paper_count": 23, "grounded_on": 8 },
  "answer":    "…synthesized prose citing [2310.06825], [2401.12345]…",
  "citations": [ /* gaps-shaped paper objects for each cited id, + why_cited */ ],
  "coverage":  "ok" | "thin"   // 'thin' = library barely covers the question (§5 Q4)
}
```

1. **Resolve scope → a set of saved paper ids.** Whole library: `user_interactions` where
   `interaction_type='save'`. Collection: `collection_papers` for the resolved collection.
   (Invert the gaps subtract clauses into a restrict.)
2. **Embed the question** (`get_query_embedding`).
3. **Scoped retrieval — exact cosine over the saved set, NOT IVFFlat.** The saved set is
   bounded (tens–hundreds of papers), so an exact scan is both faster and more accurate than
   the IVFFlat index: `… FROM papers WHERE id = ANY($ids) AND embedding IS NOT NULL ORDER BY
   embedding <=> $q::vector LIMIT $k`. Same SQL shape as `gaps._foundational_gaps` /
   `_collection_data`. Take top-`limit`.
4. **Synthesize.** Feed the top-`limit` papers' **`llm_summary`** (v1 fidelity — see §5 Q1)
   into a DeepSeek synthesis prompt (reuse the agent client). Constraints in the prompt:
   answer *only* from the provided papers, cite by `arxiv_id`, and say so plainly if the
   set doesn't cover the question (→ `coverage: "thin"`, optionally point the user at
   `find_gaps`).
5. **Gate.** `require_pro_or_quota("ask_library", N)` + `increment_quota` on success — see
   §5 Q2 for the free-taste-vs-Pro-only decision.

**Cost:** one Gemini query-embed + one DeepSeek synthesis call over summaries.
> **Corrects `limits-spec` §3 cost model:** synthesis verbs (`field_guide`, and this) also
> spend **DeepSeek** tokens, not only Gemini. Cheap, but not zero — fold DeepSeek synthesis
> into the pool-weight thinking when the pool gets built.

## 5. Open questions (decide before/at build)

1. **Synthesis fidelity — summaries vs full text.** *Lean: `llm_summary` for v1.* They're
   already LLM-distilled (high signal), so synthesis-over-summaries is strong and ~free
   incremental cost. Full-text chunks (needs the `agent/fulltext.py` path + chunking) is a
   bigger, higher-fidelity v2 — only if v1 answers feel shallow.
2. **Gating — Pro-only vs free taste.** *This is the sharp one.* The `limits-spec` tier
   matrix says `ask_library` is **Pro-only**. But the closest analog, **Field Guide**, is
   **free 1/month + Pro 20/month**, and Principle 2 ("fall in love in one session") argues
   the flagship verb is exactly what a free user should *taste* once. *Lean: free 1/month +
   Pro* (mirror Field Guide; update the limits-spec matrix). Cost isn't the reason to wall
   it — one summary-grounded synthesis is cheap. Decide.
3. **Sync vs poll/persist.** *Lean: synchronous v1* (return the answer in one response, like
   `gaps`) — summary-grounded synthesis is a single retrieval + single LLM call, fast enough
   to skip the `field_guide_reports` table + poll dance (no migration, less surface). Add
   poll-mode + an `ask_answers` history table later if/when fidelity (full text) makes it slow.
4. **Coverage honesty.** When the library barely covers the question: refuse, or answer with
   a `coverage:"thin"` caveat and a nudge to `find_gaps`? *Lean: answer + caveat + nudge* —
   it cross-sells the inverse verb and never dead-ends the user.
5. **Scope default & validation.** No seed ⇒ whole library (confirm). Reject >1 collection
   seed like `find_gaps`. Empty library / empty collection ⇒ clean `{error,message}`
   ("Save a few papers first").

## 6. Sequencing

1. Ship `ask_library` v1 (summaries, synchronous, scoped to library/collection, gated).
2. Derive **landscape-report** = a scheduled `ask_library` (Heroku Scheduler + a fixed
   "what's new and important across my saved areas this month" prompt). Reuses the digest
   delivery path.
3. `find_gaps` stays the distinct negative-space verb. `ask` + `gaps` = the complete
   "about my library" pair; together they're the broad-ICP Pro story.
