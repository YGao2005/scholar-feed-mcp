# Scholar Feed — Watch v2: structured, agent-managed filters

Status: **v1 SHIPPED** (backend Heroku v396; MCP client v3.7.0) · Owner: @YGao2005 · Last updated: 2026-06-02
Related: [`watch-tool-spec.md`](./watch-tool-spec.md), [`watches-backend-spec.md`](./watches-backend-spec.md)
(v1 cosine matcher), [`roadmap-and-scoping.md`](./roadmap-and-scoping.md).

## 0. Why v2

A v1 watch is a **phrase → one embedding → a cosine radius**: a blurry target with no
boundary and no "this, not that". It's recall, not scope. v2 makes a watch a **declarative,
composable filter** the user's **coding agent manages via the MCP** — "watch papers that cite
my collections X/Y, in cs.SE, by author Z, with code" — evaluated as a **deterministic SQL
predicate** over new papers. Semantic similarity survives as *one optional predicate*, not the
whole mechanism.

The delivery is unchanged: hits flow into the single unified "For You Today" email as
top-priority items. The only email change is the label — now the **exact criteria that fired**
("Cites your 'Agents' collection · cs.SE · has code"), which is the curation/scope you want,
**with no LLM**.

**Defensibility (Principle 4) — read this before scoping v1.** A bare author/category/keyword
watch is a *commodity firehose* — arXiv RSS and Google Scholar alerts already do it, free. v2's
value is NOT any single filter; it's **composition + the citation-graph/collection-relative
criteria + agent management + delivery in your one curated email**, none of which a commodity
tool offers. v1 must lead with the composed and graph cases; never ship "papers by author X"
alone as the headline — that's a rebuilt Scholar alert.

---

## 1. Data reality (fill-rate check, prod, 2026-06-02)

The matcher runs over `published_date > NOW() - window`, so the fill rate **on fresh papers**
is what matters — enrichment lags publication. Measured fraction populated:

| Field (source) | last 8d | last 30d | v1 verdict |
|---|---|---|---|
| `primary_category` / `categories` | 100% | 100% | ✅ **reliable gate** |
| `llm_novelty_score` | 100% | 100% | ✅ reliable |
| `embedding` (semantic) | 96% | 99% | ✅ reliable |
| `paper_authors` link (→ `authors`) | 100% | 100% | ✅ **reliable** (654k-row authors table) |
| `citations_fetched_at` | 95% | 99% | ✅ attempted |
| `out_edge_count > 0` (resolved refs) | **33%** | 78% | ⚠️ **lags** — see §4 citation caveat |
| `has_code = true` | 13% | 12% | ✅ usable (real ~13% base rate) |
| `task_category` | 46% | 90% | ⚠️ best-effort (lags) |
| `method_category` | 33% | 65% | ⚠️ best-effort (lags) |
| `application_domain` | 22% | 45% | ⚠️ best-effort (lags) |
| `keywords` (array) | 0% | 5% | ❌ **dead** — use full-text instead |
| `institution_tags` | 1% | 0% | ❌ **dead** |
| `institutions` table | — | — | ❌ 30-row *reference* list (match_patterns), **no per-paper link** |

**Consequences locked for v1:**
- **Keyword filtering uses full-text** (`search_vector` / `title`+`abstract` regex), NOT the
  `keywords` array (unpopulated).
- **Institutions are deferred** — there is no per-paper affiliation data. Doing it needs an
  enrichment pass (match author affiliations against `institutions.match_patterns` at ingest);
  that's a separate build, out of v1 scope. (This overturns the earlier assumption that
  institution filtering was cheap.)
- **The "cites my collection" criterion is real but lossy on fresh papers** (33% of 8d papers
  have resolved out-edges). Mitigation in §4.
- **`method/task/domain` are best-effort only** — never the *sole* gate (they'd silently drop
  half the recent window); fine as a narrowing add-on, and they self-heal via re-evaluation
  (§4) as enrichment lands.

---

## 2. The criteria schema (the watch `seed` jsonb, `version: 2`)

The existing `topic_alerts.seed jsonb` column already stores arbitrary seeds, so **no migration
is needed for storage**. A v2 watch:

```jsonc
{
  "version": 2,
  "match": "all",            // AND across the criterion groups below; lists within a group are OR
  "recency_days": 7,         // window; allow up to 30 (raise for citation criteria — §4)
  "criteria": {
    "collections": { "ids": ["<uuid>", ...], "relation": "cites" },
        // relation: "cites" (new paper cites a collection member — graph, defensible, lossy on fresh)
        //         | "cited_by" | "by_authors" (new paper shares an author with the collection)
        //         | "similar"  (semantic neighborhood of the collection centroid — immediate)
    "authors":    { "ids": ["<uuid>", ...], "names": ["..."], "min_h_index": null },
    "categories": ["cs.SE", "cs.AI"],          // matches primary_category OR categories[]
    "text":       { "query": "agent", "field": "title_abstract",
                    "mode": "fulltext" },       // mode: "fulltext" (search_vector) | "regex" (~* on field)
    "has_code":   true,
    "min_novelty": 0.5,
    "similar":    { "to": "collection:<uuid>" | "paper:<arxiv_id>" | "text:<phrase>",
                    "min_score": null }         // OPT-IN semantic predicate; min_score defaults per §4
  }
}
```

Only present keys are applied. `match:"all"` (AND across groups) is the **precision default**
you want; OR within a list. v1 backward-compat: existing topic/collection/anchor watches are
treated as `{version:1}` → a `similar`-only predicate (nothing regresses).

---

## 3. MCP surface (the agent-management layer)

The whole point: a coding agent fetches a watch, edits parameters, writes it back. Tools:

- **`list_watches`** → each watch with its full structured `criteria` (so the agent can read
  current state). Add a human/agent-readable `summary` string per watch.
- **`create_watch(name, criteria)`** / **`update_watch(id, criteria)`** — accept the §2 object.
  `update_watch` is the key new verb (today only create/delete exist).
- **`preview_watch(criteria, recency_days?)`** — **NEW, the tuning loop.** Dry-run the predicate
  over the recent window; return `{match_count, sample:[…]}` *without saving*. This is what lets
  an agent iterate ("too broad → add category → re-preview") before committing a watch. High
  value, cheap (one SQL count + a LIMIT sample).
- **`delete_watch(id)`** — unchanged.

Quota: keep the existing FREE=1 / PRO=10 watch count (`billing.is_pro`).

---

## 4. The matcher (new structured path)

Replaces the matmul for structured watches; the cosine path stays for `similar`/v1.

1. **Build a parameterized SQL predicate** from `criteria` over the candidate pool
   `papers WHERE published_date > NOW() - recency_days` (+ `embedding IS NOT NULL` only if a
   `similar` predicate is present):
   - `collections.relation="cites"` → `EXISTS (paper_citations pc WHERE pc.citing_paper_id = p.id
     AND pc.cited_paper_id IN (collection members))`
   - `"by_authors"` → `EXISTS (paper_authors pa … author_id IN (collection's authors))`
   - `"similar"` / `collections."similar"` → `p.embedding <=> $centroid < $radius`
   - `authors` → `EXISTS (paper_authors pa JOIN authors a … a.id = ANY($ids) OR a.normalized_name = ANY($names))`
   - `categories` → `p.primary_category = ANY($c) OR p.categories && $c`
   - `text.fulltext` → `p.search_vector @@ websearch_to_tsquery($q)`; `text.regex` → `p.title ~* $re`
   - `has_code` → `p.has_code IS TRUE`; `min_novelty` → `p.llm_novelty_score >= $n`
2. **Exclude** the user's saved set + any seed-collection members + the delivery watermark
   (`matched_at > coalesce(last_delivered_at, created_at)` is enforced at read, as today).
3. **Rank/limit**: `ORDER BY` cosine (if `similar`) else `llm_novelty_score`/`rank_score` DESC,
   `LIMIT WATCH_MAX_HITS_PER_RUN`. Write `watch_hits(watch_id, paper_id, score)` with
   `ON CONFLICT DO NOTHING` (idempotent — unchanged), set `last_evaluated_at`.

**Cost:** one indexed SQL per watch over a ~3k-row daily window. Cheaper than the matmul, and
no global threshold to calibrate (the user declared the boundary).

**Citation-lag mitigation (§1):** because re-runs are idempotent and dedup on
`(watch_id, paper_id)`, a paper that didn't match on day 1 (out-edges unresolved) **matches on a
later run once its edges land** — no double-delivery. So set the **citation-criterion window to
~30 days** (vs 7 for others) and let daily re-evaluation catch the tail. Same self-heal covers
the `method/task/domain` enrichment lag.

---

## 5. Delivery & email label (no LLM)

Unchanged plumbing: `get_watch_candidates` → unified list → top tier. The label is built
**deterministically** from which criteria matched, e.g. *"Cites your 'Agents' collection ·
cs.SE · has code"*. That precise "why" is the curation; the optional LLM synthesis preamble
(see roadmap) is a separate later polish, not load-bearing for scope.

---

## 6. Open questions (decide before build)

1. **Collection `relation` default.** `cites` (defensible graph, but 33% fresh coverage →
   30d window) vs `similar` (immediate, semantic). *Lean: require the agent to set it; default
   `similar` for immediacy, document the citation tradeoff.* Or ship a composite "similar OR
   cites".
2. **Institutions.** Defer (recommended — no data), or fund the enrichment build (author
   affiliations → `institutions.match_patterns`)? It's the one requested criterion with zero
   coverage today.
3. **Confidence tiering.** Structured predicates are exact (deliver). Only `similar` has a
   threshold — tier *that* one (deliver high / hold borderline on the in-session pull)?
4. **`text` default** — full-text (`search_vector`, fast/ranked) as default, regex on title as
   the power option (fine on the small daily window)? *Lean: yes.*
5. **Score semantics** for ranking watch hits within the email — cosine when `similar` present,
   else `llm_novelty_score`? Minor.

## 7. Sequencing

1. ✅ **v1 SHIPPED (2026-06-02):** structured criteria = {collections(cites/by_authors/similar),
   authors, categories, text(fulltext/regex), has_code, min_novelty, similar}, `match:all`,
   per-watch SQL matcher (backend Heroku v394), `create(kind=filter)`/`update_watch`/`preview_watch`
   (v396), MCP client tools `create_watch(criteria)`/`update_watch`/`preview_watch` (v3.7.0).
   v1 cosine watches backward-compat as `similar`. Validated read-only on Aiyara across relations.
2. **Defer:** institutions (enrichment — no per-paper affiliation data), method/task/domain as
   primary gates (until fresh-paper fill improves), the LLM synthesis preamble; email-format
   tweaks + the live Aiyara watch are the next interactive step.
