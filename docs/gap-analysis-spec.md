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
  "foundational_gaps": [ /* paper objects (same shape as search_papers), with cited_by_in_niche evidence */ ],
  "frontier_gaps":     [ /* paper objects, with llm_novelty_score + recency */ ]
}
```

Backend algorithm:
1. Resolve the seed → a set of niche papers (a collection's papers, or a topic's top-K by
   retrieval).
2. `foundational`: run lineage over the niche set, collect canonical anchors weighted by
   `cited_by_in_niche`, **subtract the user's saved set**, take top `limit`.
3. `frontier`: recent (e.g. ≤90d) papers above a novelty floor in the niche, **subtract the
   saved set**, take top `limit`.
4. Pro gate: free accounts → `403 {error:"pro_required", message:"Gap analysis is a Pro
   feature — scholarfeed.org/upgrade"}`.

Cost: reuses precomputed lineage + the search index; the marginal cost is one query-embed
for a `topic` seed (a `collection` seed reuses stored embeddings). Pool weight ~3–4
(heavier read). No new infra.

## 4. Open questions

1. **Subtract library vs subtract just the seed collection?** Subtracting the whole library
   is "what I've never saved anywhere"; subtracting only the collection is "what's missing
   from THIS collection (but maybe saved elsewhere)." Lean: subtract the **collection** for
   a collection seed, the **whole library** for a topic seed.
2. **Annotate why** each gap matters (citation count in niche, who cites it) — cheap, high
   value for trust. Include in v1?
3. Bundle `find_gaps` with the cheap **annotations** add-on (notes on saved papers) as the
   "basics" release, or ship separately?
