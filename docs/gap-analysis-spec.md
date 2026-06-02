# Scholar Feed — Gap-Analysis (`find_gaps`)

Status: **draft for review** · Owner: @YGao2005 · Last updated: 2026-06-01
Related: [`limits-spec.md`](./limits-spec.md) (gap-analysis is Pro), [`watch-tool-spec.md`](./watch-tool-spec.md)

The first "basic" Pro verb after watches: cheap because it **reuses backend
capability that already exists** (`get_foundational_lineage` + novelty search) — the
only new backend is a thin aggregation endpoint, no new ML. Answers "what am I
missing?" for a collection or topic.

---

## 1. Concept — two kinds of gap

A gap is important work in the seed's niche that the user has **not** saved. Two buckets,
each leaning on a capability we already ship:

| Bucket | Source (existing capability) | Answers |
|---|---|---|
| `foundational_gaps` | `get_foundational_lineage`, aggregated across the seed's papers → canonical anchors, minus the saved set | "What landmark/foundational work in this area am I not tracking?" |
| `frontier_gaps` | recent high-novelty search scoped to the niche, minus the saved set | "What new work in this area have I missed?" |

> **Design decision (flag for review):** gaps = foundational ∪ frontier. If you'd rather
> start with one bucket, `foundational` is the more defensible (pure citation-graph, no
> substitute) and `frontier` overlaps conceptually with a watch. Default ships `both`;
> `scope` lets the caller pick.

The seed defines the niche:
- **collection** (`collection_name`/`collection_id`) ⭐ — the payoff for curating a
  collection: "what's missing from everything I filed here." Backend derives the niche
  from the collection's papers (embedding centroid + dominant categories).
- **topic** (`topic`) — free-text area, for users without a collection yet.

## 2. MCP tool (built — `src/tools/gaps.ts`)

`find_gaps` — read-only, requires `SF_API_KEY` (needs the library to subtract), Pro-gated.

```
collection_name  string   one seed: by collection name (backend resolves)
collection_id    string   one seed: by collection UUID
topic            string   one seed: free-text area
scope            enum      foundational | frontier | both (default both)
limit            int       max gaps per bucket, 1..50 (default 10)
```
Exactly-one-of seed enforced in the handler (mirrors `find_author` / `create_watch`).
Calls `GET /gaps` and returns the JSON. Pro enforcement is the backend's job — for a free
account it returns `{error, message}` and client.ts surfaces the upgrade prompt verbatim
(this is the first consumer of that client.ts change).

## 3. Backend contract (NOT in this repo)

`GET /gaps` — query: one of `collection_name` / `collection_id` / `topic`, plus `scope`,
`limit`. Returns:

```jsonc
{
  "niche": { "label": "efficient LLM inference", "categories": ["cs.LG"], "seed_paper_count": 14 },
  "foundational_gaps": [ /* paper objects (same shape as search_papers), with the evidence
                           pair cited_by_in_niche + cited_by_global (the visible lift signal) */ ],
  "frontier_gaps":     [ /* paper objects, with llm_novelty_score + recency */ ]
}
```

Backend algorithm:
1. Resolve the seed → a niche centroid (a collection's embedding centroid, or a topic embedding).
2. `foundational`: take the niche = the **75-NN** ball around the centroid; count how many niche
   papers cite each candidate (`cited_by_in_niche`); rank by **TF-IDF citation LIFT** =
   `cited_by_in_niche * ln(N / cited_by_global)` (global rarity down-weights ubiquitous canon);
   keep a min-in-niche floor; **subtract the user's saved set**; take top `limit`. See §5.
3. `frontier`: recent (e.g. ≤90d) papers above a novelty floor in the niche, **subtract the
   saved set**, take top `limit`. (Already niche-specific — vector-nearest + recent + novel — unchanged.)
4. Pro gate: free accounts → `403 {error:"pro_required", message:"Gap analysis is a Pro
   feature — scholarfeed.org/upgrade"}`.

Cost: reuses precomputed lineage + the search index; the marginal cost is one query-embed
for a `topic` seed (a `collection` seed reuses stored embeddings). Pool weight ~3–4
(heavier read). No new infra.

## 4. Open questions

1. ~~**Subtract library vs subtract just the seed collection?**~~ **RESOLVED (2026-06-01): keep
   per-seed subtract — collection seed subtracts the collection's own members; topic seed
   subtracts the whole library** (matches the shipped code in `backend/api/routers/gaps.py`).
   Rationale: "what's missing from THIS collection" is the literal promise of a
   collection-scoped gap analysis. Switching collection seeds to whole-library subtract
   would *hide cross-collection signal* — a paper foundational to your "agents" collection
   but filed under "RL" should surface as a gap in "agents" (the "file this here too" nudge),
   not be suppressed because you saved it somewhere. If noise ("I already have that") becomes
   a real complaint, the fix is to **annotate** "saved in your 'RL' collection" (see Q2),
   not to subtract the whole library.
2. ~~**Annotate why** each gap matters~~ **PARTIALLY DONE (2026-06-01):** foundational rows now
   return the evidence pair `cited_by_in_niche` + `cited_by_global` (e.g. "13 of your niche cite
   this, 107 globally") — the visible signal behind the lift ranking. "Who cites it" / "saved in
   your X collection" still open.
3. Bundle `find_gaps` with the cheap **annotations** add-on (notes on saved papers) as the
   "basics" release, or ship separately?

## 5. Foundational ranking — niche-specificity fix (RESOLVED 2026-06-01)

**Problem.** v1 ranked foundational by raw `cited_by_in_niche` over a coarse **200-NN** niche.
For any sub-niche that lives inside a much larger field, the 200-NN ball is swamped by the
parent field's papers, which all cite the parent canon — so the bucket surfaced *"famous in the
parent field,"* not *"foundational to THIS niche."* Confirmed live: topic **"AI agent safety"**
returned ReAct/AutoGen/MetaGPT/Reflexion/CAMEL (general agent canon) with only **1/10**
safety-specific (Concrete Problems in AI Safety); ReAct/Reflexion/MetaGPT also leaked across
*both* agent-adjacent niches (safety AND software-engineering).

**Diagnosis — two failure modes.** (a) *Outsider contamination*: a globally-ubiquitous paper
(GPT-3 in a RAG niche; InstructGPT/CoT in an agents niche) is cited a lot everywhere, so it
floats into the foundational list. (b) *Niche dilution*: the niche is a sparse sub-region; the
200-NN is mostly parent-field papers, so the parent canon genuinely dominates in-niche citations.

**Fix — two cheap, read-only changes** (no migration, no new ML):
- **Tighter niche: `_NICHE_K` 200 → 75.** Concentrates the neighbourhood on the actual sub-field
  (the bigger lever for dilution). Min-in-niche floor raised 2 → 3 for the tighter ball.
- **Rank by TF-IDF lift** `cited_by_in_niche * ln(N / cited_by_global)` instead of raw count
  (`N ≈ 600k`, the in-corpus global in-degree as the rarity denominator). Demotes ubiquitous
  outsiders.

**Why TF-IDF and not a raw in/global fraction.** A raw fraction `n_in/(g+K)` over-rewards *recency*:
a brand-new paper with few global citations looks "niche-specific" by ratio, so pure-fraction
ranking **regressed the niches that already worked** — it pushed the real RAG canon down hard
(original RAG paper #1→#280, DPR #4→#267, Self-RAG #2→#103) and promoted obscure recent variants;
same on SWE (SWE-bench #1→#155). TF-IDF's *linear-n* term keeps prominence in play, so it demotes
only the ubiquitous outsiders without the recency pathology.

**Validation (read-only against prod, 4 niches, exact topic centroids via Gemini):**
| niche | before (200-NN raw) | after (75-NN, TF-IDF) |
|---|---|---|
| efficient LLM inference | polluted by general LLM canon (Attention #2, LLaMA, Llama2, GPT-3) | near-perfect: FlashAttention, PagedAttention, StreamingLLM, GPTQ, FlexGen, SpecDecode, AWQ; Attention→#43, GPT-3→#29 |
| retrieval-augmented generation | good already | preserved (real RAG canon on top; GPT-3 outsider demoted) |
| LLM agents for software engineering | mostly good, ReAct/MetaGPT leaking | SWE-agent/SWE-bench/OpenHands/Agentless/AutoCodeRover on top; MetaGPT/Reflexion demoted |
| AI agent safety | 1/10 safety-specific | 4/10 safety-specific (Concrete Problems, Multi-Agent Risks, Constitutional AI, AI Control); pure outsiders (InstructGPT, CoT) gone |

Residual: for a genuinely sparse sub-niche like agent-safety, general *multi-agent infrastructure*
(AutoGen, MetaGPT) still appears — defensible, since safety work builds on it, and the corpus
truly lacks a dense safety-only foundational layer. Pushing further would require a
specificity weighting strong enough to regress the mature niches — not worth it.

**Frontier bucket: unchanged** (vector-nearest + recent + novel is already niche-specific).
