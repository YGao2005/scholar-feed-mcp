/**
 * Structured-output schemas + helpers for the MCP tools.
 *
 * Every tool declares an `outputSchema` and returns `structuredContent` next to
 * the human-readable text. The schemas are deliberately PERMISSIVE — every field
 * is optional and object schemas allow unknown keys (`.catchall(z.unknown())`) —
 * because the backend response shape is owned by a separate service and evolves
 * (lean vs verbose paper shapes, new extraction fields, paginated envelopes).
 *
 * Why permissive matters: the MCP SDK validates `structuredContent` against the
 * declared schema on every SUCCESSFUL call (server/mcp.js `validateToolOutput`)
 * and THROWS on a mismatch. Zod objects strip unknown keys instead of rejecting
 * them, so the only way to fail is a DECLARED field present with the wrong type.
 * Keeping every field optional + loosely typed means a benign backend addition
 * can never turn into a hard tool error. The original `structuredContent` is sent
 * on the wire unchanged (validation does not mutate it), so the stripping is a
 * gate, not a filter — extra fields still reach the client.
 *
 * The text `content` is unchanged, so clients that ignore `structuredContent`
 * see no difference; clients that read it get typed, machine-usable output.
 *
 * Shapes are exported as raw Zod shapes (plain objects of validators) — the same
 * form `inputSchema` uses, and the form `registerTool` expects for `outputSchema`
 * (mcp.js `getZodSchemaObject` → `objectFromShape`).
 */

import { z } from "zod";

/**
 * Coerce an arbitrary backend payload into a JSON object for `structuredContent`
 * (MCP requires the top level to be an object). Objects pass through untouched;
 * arrays / primitives / null are wrapped under `result` so the contract holds
 * even if an endpoint returns a non-object.
 */
export function asStructuredObject(result: unknown): Record<string, unknown> {
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return { result };
}

/**
 * The structured payload for a status / mutation tool: human text plus a small
 * machine-readable object. Every non-error return MUST carry `structuredContent`
 * once a tool declares an outputSchema, so the per-file `text()` helpers default
 * to `{ ok: true, message }` via this.
 */
export function statusContent(
  message: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ok: true, message, ...fields };
}

/**
 * A paper record across the lean (12-field), search (+similarity), verbose
 * (~18-field) and field-orientation variants. Loose + all-optional so it accepts
 * every variant — and any future extraction field — without ever rejecting.
 */
const paperObject = z
  .object({
    arxiv_id: z.string().optional(),
    title: z.string().optional(),
    authors: z.array(z.string()).optional(),
    year: z.number().optional(),
    published_date: z.string().optional(),
    categories: z.array(z.string()).optional(),
    primary_category: z.string().optional(),
    has_code: z.boolean().optional(),
    github_url: z.string().nullable().optional(),
    github_stars: z.number().nullable().optional(),
    citation_count: z.number().optional(),
    venue_name: z.string().nullable().optional(),
    llm_summary: z.string().nullable().optional(),
    llm_significance: z.string().nullable().optional(),
    llm_novelty_score: z.number().nullable().optional(),
    impact_pct: z.number().nullable().optional(),
    similarity: z.number().optional(),
    rank_score: z.number().optional(),
    arxiv_url: z.string().optional(),
    pdf_url: z.string().optional(),
    institution_tags: z.array(z.string()).optional(),
  })
  .catchall(z.unknown())
  .describe(
    "A paper record. Verbose calls add extraction fields (method_name, datasets, baselines, ...).",
  );

/**
 * Shared envelope for every tool that returns a `papers` array:
 * search_papers, get_citations, get_field_orientation, list_library,
 * check_watches. Unknown top-level keys (e.g. an endpoint's own wrapper) are
 * stripped, not rejected, so this fits all of them.
 */
export const papersOutput = {
  papers: z
    .array(paperObject)
    .optional()
    .describe("Matched / returned papers."),
  total: z
    .number()
    .optional()
    .describe("Total results available for the query."),
  page: z.number().optional(),
  limit: z.number().optional(),
  mode: z.string().optional().describe("Search mode actually applied."),
  direction: z
    .string()
    .optional()
    .describe("Citation direction (get_citations: citing | cited_by)."),
  topic: z.string().optional(),
  note: z.string().nullable().optional(),
  not_found: z
    .array(z.string())
    .optional()
    .describe("Requested IDs that had no match."),
  next_cursor: z
    .string()
    .nullable()
    .optional()
    .describe("Keyset cursor for the next page, or null when exhausted."),
  hits: z
    .array(paperObject)
    .optional()
    .describe("New watch matches (check_watches)."),
  results: z.array(paperObject).optional(),
};

/** get_paper: the papers envelope, plus the bibtex / status keys for format='bibtex'. */
export const getPaperOutput = {
  ...papersOutput,
  bibtex: z.string().optional().describe("BibTeX entry (format='bibtex')."),
  count: z.number().optional(),
  format: z.string().optional(),
  ok: z.boolean().optional(),
  message: z.string().optional(),
};

/** fetch_fulltext: lean `results_text` mode and the full `sections` object mode. */
export const fulltextOutput = {
  source: z
    .string()
    .optional()
    .describe("Where the text came from (e.g. arxiv)."),
  arxiv_id: z.string().optional(),
  results_text: z
    .string()
    .nullable()
    .optional()
    .describe("Results/experiments excerpt (default 'results' mode)."),
  sections: z
    .object({
      abstract: z.string().nullable().optional(),
      introduction: z.string().nullable().optional(),
      related_work: z.string().nullable().optional(),
      method: z.string().nullable().optional(),
      results: z.string().nullable().optional(),
      conclusion: z.string().nullable().optional(),
    })
    .catchall(z.unknown())
    .optional()
    .describe("Per-section text (sections='all')."),
  table_captions: z.array(z.string()).optional(),
};

const lineagePaper = z
  .object({
    id: z.string().optional(),
    arxiv_id: z.string().optional(),
    title: z.string().optional(),
    authors: z.array(z.string()).optional(),
    year: z.number().optional(),
    global_citations: z.number().optional(),
    niche_indegree: z.number().optional(),
    lift: z.number().optional(),
    cited_by_in_niche: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());

/** get_foundational_lineage: the three citation-graph tiers (nested under `tiers`). */
export const lineageOutput = {
  anchor: z.string().optional(),
  scope: z.string().optional(),
  niche_size: z.number().optional(),
  tiers: z
    .object({
      niche_roots: z.array(lineagePaper).optional(),
      field_level: z.array(lineagePaper).optional(),
      discipline: z.array(lineagePaper).optional(),
    })
    .catchall(z.unknown())
    .optional()
    .describe("Foundational tiers: niche_roots → field_level → discipline."),
  // Some shapes flatten the tiers to the top level — accept both.
  niche_roots: z.array(lineagePaper).optional(),
  field_level: z.array(lineagePaper).optional(),
  discipline: z.array(lineagePaper).optional(),
  note: z.string().nullable().optional(),
};

const authorObject = z
  .object({
    id: z.number().optional(),
    name: z.string().optional(),
    // Bibliometrics + computed scores are NULLABLE: after the 2026-06 OpenAlex
    // identity rebuild, unresolved (arxiv_only) authors carry NULL h_index/papers,
    // and authors below the scoring threshold carry NULL primary_field/rank score.
    // zod .optional() accepts undefined but NOT null, so these must be .nullable().
    h_index: z.number().nullable().optional(),
    total_papers: z.number().nullable().optional(),
    primary_field: z.string().nullable().optional(),
    research_topics: z.array(z.string()).optional(),
    author_rank_score: z.number().nullable().optional(),
    semantic_scholar_id: z.string().nullable().optional(),
    years_active: z.number().nullable().optional(),
  })
  .catchall(z.unknown());

/** find_author: polymorphic — q-mode list envelope OR id-mode flat profile. */
export const authorOutput = {
  // q-mode envelope
  query: z.string().optional(),
  search_type: z.string().optional(),
  total: z.number().optional(),
  authors: z
    .array(authorObject)
    .optional()
    .describe("Matching authors (q-mode)."),
  // id-mode flat profile (bibliometrics/rank nullable — see authorObject note)
  id: z.number().optional(),
  name: z.string().optional(),
  h_index: z.number().nullable().optional(),
  total_papers: z.number().nullable().optional(),
  total_citations: z.number().nullable().optional(),
  primary_field: z.string().nullable().optional(),
  research_topics: z.array(z.string()).optional(),
  rank: z.number().nullable().optional(),
  top_papers: z
    .array(paperObject)
    .optional()
    .describe("Top papers by rank (id-mode profile)."),
};

/** co_author_graph: co-authorship edges. */
export const coAuthorGraphOutput = {
  queried_author_ids: z.array(z.number()).optional(),
  window_years: z.number().optional(),
  edge_count: z.number().optional(),
  edges: z
    .array(
      z
        .object({
          from: z.number().optional(),
          to: z.number().optional(),
          papers_count: z.number().optional(),
          last_collab_year: z.number().optional(),
        })
        .catchall(z.unknown()),
    )
    .optional()
    .describe(
      "Co-authorship edges {from, to, papers_count, last_collab_year}.",
    ),
};

/** embed_text: the embedding vector + model metadata. */
export const embedOutput = {
  embedding: z
    .array(z.number())
    .optional()
    .describe("The embedding vector (768-dim Gemini Flash)."),
  model: z.string().optional(),
  task_type: z.string().optional(),
  dimensions: z.number().optional(),
  dims: z.number().optional(),
};

/** preview_watch: dry-run summary of a structured filter. */
export const previewWatchOutput = {
  window_days: z.number().optional(),
  needs_similarity: z.boolean().optional(),
  match_count: z.number().optional(),
  sample: z
    .array(paperObject)
    .optional()
    .describe("A sample of matching papers."),
  ok: z.boolean().optional(),
  message: z.string().optional(),
};

/** list_collections: the user's named collections. */
export const collectionsListOutput = {
  collections: z
    .array(
      z
        .object({
          id: z.string().optional(),
          name: z.string().optional(),
          paper_count: z.number().optional(),
        })
        .catchall(z.unknown()),
    )
    .optional(),
  ok: z.boolean().optional(),
  message: z.string().optional(),
};

/** list_watches: the user's standing watches. */
export const watchesListOutput = {
  watches: z
    .array(
      z
        .object({
          id: z.string().optional(),
          name: z.string().optional(),
          novelty_min: z.number().optional(),
          summary: z.string().optional(),
          last_evaluated_at: z.string().nullable().optional(),
          pending_hits: z.number().optional(),
        })
        .catchall(z.unknown()),
    )
    .optional(),
  ok: z.boolean().optional(),
  message: z.string().optional(),
};

/** find_gaps: the two gap buckets. */
export const gapsOutput = {
  foundational_gaps: z
    .array(paperObject)
    .optional()
    .describe("Canonical anchors in the niche not in your library."),
  frontier_gaps: z
    .array(paperObject)
    .optional()
    .describe("Recent high-novelty work you haven't saved."),
  ok: z.boolean().optional(),
  message: z.string().optional(),
};

/** ask_library: the synthesized answer + grounding. */
export const askLibraryOutput = {
  answer: z
    .string()
    .optional()
    .describe("The synthesized answer with inline [arXiv-ID] citations."),
  citations: z.array(z.unknown()).optional(),
  papers: z.array(paperObject).optional(),
  ok: z.boolean().optional(),
  message: z.string().optional(),
};

/** Shared shape for the status / mutation tools (save, like, watch/collection writes). */
export const statusOutput = {
  ok: z.boolean().optional().describe("True when the operation succeeded."),
  message: z
    .string()
    .optional()
    .describe("Human-readable summary of the outcome."),
  action: z
    .string()
    .optional()
    .describe(
      "Machine label: saved | no_change | removed | liked | created | updated | deleted.",
    ),
  arxiv_id: z.string().optional(),
  collection: z
    .unknown()
    .optional()
    .describe("The created/affected collection, when applicable."),
  watch: z
    .unknown()
    .optional()
    .describe("The created/affected watch, when applicable."),
};
