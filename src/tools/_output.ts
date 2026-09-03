/**
 * Structured-output schemas + helpers for the MCP tools.
 *
 * Every tool declares an `outputSchema` and returns `structuredContent` next to
 * the human-readable text. The schemas are deliberately PERMISSIVE — every field
 * is optional and object schemas allow unknown keys (`.catchall(z.unknown())`) —
 * because the backend response shape is owned by a separate service and evolves
 * (lean vs verbose paper shapes, new extraction fields, paginated envelopes).
 *
 * Why permissive matters: the declared schema is validated on every SUCCESSFUL
 * call, in TWO places that behave DIFFERENTLY on an unknown key:
 *
 *   - SERVER (mcp.js `validateToolOutput`) runs `safeParseAsync`, and a zod
 *     object STRIPS unknown keys — so an extra key passes here.
 *   - CLIENT (client/index.js `callTool`, and the Python SDK's
 *     `_validate_tool_result`) validates against the PUBLISHED JSON SCHEMA with
 *     a jsonschema validator. `z.object()` emits `additionalProperties: false`,
 *     so an extra key is REJECTED there and the whole call fails.
 *
 * That asymmetry is why issue #42 shipped: the backend started echoing `sort`
 * on every search response, the server-side strip hid it, and every strict
 * client broke. A schema that merely lists today's keys is therefore not enough
 * — the ENVELOPE ITSELF must accept unknown keys, because the backend response
 * shape is owned by a separate service and adds fields without notice.
 *
 * So every exported shape below is wrapped in `looseObject()`, which emits
 * `additionalProperties: {}`. Declared fields still carry types + descriptions
 * (that is the machine-readable contract); undeclared ones ride along instead of
 * turning a successful search into a client-side hard error. Keep every declared
 * field optional + loosely typed for the same reason.
 *
 * The text `content` is unchanged, so clients that ignore `structuredContent`
 * see no difference; clients that read it get typed, machine-usable output.
 *
 * `registerTool` accepts either a raw shape or a full Zod schema for
 * `outputSchema` (mcp.js `getZodSchemaObject`), so passing the wrapped objects
 * is a drop-in. Do NOT "simplify" these back to bare `{...}` shapes — that
 * silently restores `additionalProperties: false` and re-opens #42. The
 * output_schema contract test asserts this and will fail if you do.
 */

import { z } from "zod";

/**
 * Wrap a raw shape so the emitted JSON Schema allows unknown top-level keys
 * (`additionalProperties: {}`) instead of forbidding them. See the file header:
 * a bare `z.object()` is what broke #42 for every validating client.
 *
 * Exported so a tool that declares its own output shape locally (check_drift)
 * gets the same guarantee — pass every `outputSchema` through this.
 */
export function looseObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).catchall(z.unknown());
}

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
    // Library state — present only on AUTHENTICATED responses (backend 2026-09-03).
    // is_saved/is_read are real booleans there, so `false` means "known not saved";
    // all three keys are ABSENT on anonymous responses, where nothing is known.
    is_saved: z.boolean().optional(),
    is_read: z.boolean().optional(),
    note_text: z
      .string()
      .nullable()
      .optional()
      .describe(
        "The user's own recorded verdict on this paper, when one exists. A hit carrying this was ALREADY judged — read it instead of re-deriving a verdict from the abstract.",
      ),
    collections: z
      .array(z.string())
      .optional()
      .describe(
        "Collections this saved paper is filed under, e.g. 'AgentOPA/G4' (list_library only).",
      ),
  })
  .catchall(z.unknown())
  .describe(
    "A paper record. Verbose calls add extraction fields (method_name, datasets, baselines, ...).",
  );

/**
 * Shared envelope for every tool that returns a `papers` array:
 * search_papers, get_citations, get_field_orientation, list_library,
 * check_watches. Unknown top-level keys (e.g. an endpoint's own wrapper) ride
 * along rather than failing the call, so this fits all of them.
 *
 * Kept as a raw shape so `getPaperOutput` can spread it; the wrapped export is
 * `papersOutput` below.
 */
const papersShape = {
  papers: z
    .array(paperObject)
    .optional()
    .describe("Matched / returned papers."),
  // NULLABLE, not just optional: the backend returns an explicit `total: null`
  // whenever the count is skipped rather than omitting the key — the query-less
  // browse path (sort=trending/recent/impactful) and any search whose count query
  // hits its 3s statement_timeout both do this. A non-nullable number therefore
  // failed output validation on every browse call ("expected number, received
  // null") and surfaced as an opaque MCP -32602 instead of results.
  total: z
    .number()
    .nullable()
    .optional()
    .describe(
      "Total results available for the query. null when the count was skipped (query-less browse, or the count query timed out).",
    ),
  page: z.number().optional(),
  limit: z.number().optional(),
  mode: z.string().optional().describe("Search mode actually applied."),
  sort: z.string().optional().describe("Search sort order actually applied."),
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

export const papersOutput = looseObject(papersShape);

/** get_paper: the papers envelope, plus the bibtex / status keys for format='bibtex'. */
export const getPaperOutput = looseObject({
  ...papersShape,
  bibtex: z.string().optional().describe("BibTeX entry (format='bibtex')."),
  count: z.number().optional(),
  format: z.string().optional(),
  ok: z.boolean().optional(),
  message: z.string().optional(),
});

/** fetch_fulltext: lean `results_text` mode and the full `sections` object mode. */
export const fulltextOutput = looseObject({
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
});

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
export const lineageOutput = looseObject({
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
});

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
export const authorOutput = looseObject({
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
});

/** co_author_graph: co-authorship edges. */
export const coAuthorGraphOutput = looseObject({
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
});

/** embed_text: the embedding vector + model metadata. */
export const embedOutput = looseObject({
  embedding: z
    .array(z.number())
    .optional()
    .describe("The embedding vector (768-dim Gemini Flash)."),
  model: z.string().optional(),
  task_type: z.string().optional(),
  dimensions: z.number().optional(),
  dims: z.number().optional(),
});

/** preview_watch: dry-run summary of a structured filter. */
export const previewWatchOutput = looseObject({
  window_days: z.number().optional(),
  needs_similarity: z.boolean().optional(),
  match_count: z.number().optional(),
  sample: z
    .array(paperObject)
    .optional()
    .describe("A sample of matching papers."),
  ok: z.boolean().optional(),
  message: z.string().optional(),
});

/** list_collections: the user's named collections. */
export const collectionsListOutput = looseObject({
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
});

/** list_watches: the user's standing watches. */
export const watchesListOutput = looseObject({
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
});

/** find_gaps: the two gap buckets. */
export const gapsOutput = looseObject({
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
});

/** ask_library: the synthesized answer + grounding. */
export const askLibraryOutput = looseObject({
  answer: z
    .string()
    .optional()
    .describe("The synthesized answer with inline [arXiv-ID] citations."),
  citations: z.array(z.unknown()).optional(),
  papers: z.array(paperObject).optional(),
  ok: z.boolean().optional(),
  message: z.string().optional(),
});

/** Shared shape for the status / mutation tools (save, like, watch/collection writes). */
export const statusOutput = looseObject({
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
});
