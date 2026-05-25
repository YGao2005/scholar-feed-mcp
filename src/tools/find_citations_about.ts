/**
 * find_citations_about tool — DEPRECATED v3.0.0.
 *
 * Absorbed into search_papers(scope_to_citations_of=). Deregistered from index.ts.
 * Revival = re-add the register() call in index.ts.
 * See docs/architecture/mcp-v3-surface.md deprecation table.
 */

/**
 * find_citations_about tool — citation graph filtered by topic query.
 *
 * Endpoint: GET /public/papers/{arxiv_id}/citations/about
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "find_citations_about",
    {
      description:
        "Find papers in the citation graph of a given paper that talk about a topic. Answers questions like 'find papers citing X that apply Y' — e.g. 'citations of AIAYN that apply attention to protein folding'. Returns papers re-ranked by semantic similarity to the query within the top 2000 citation neighbours (by rank_score). Each paper includes a `similarity_score` (cosine, typically 0.5–0.75 for relevant matches). HIGH-LEVERAGE PATTERN for 'improve algorithm X' / 'extend method Y' intents: fan out 3-4 calls on a single anchor paper with different intent angles (e.g. 'limitations and failure modes', 'hierarchical extensions', 'recompute vs cache tradeoffs') — each returns a coherent neighborhood and the combined set covers the design space far better than naive semantic search. Note: the citation graph does NOT bridge fields — use plain search_papers for cross-domain analog hunting. Default response is a lean 12-field shape per paper — pass verbose=true for the full 28-field shape.",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID of the source paper (e.g. '1706.03762' for AIAYN)"),
        query: z
          .string()
          .min(2)
          .max(300)
          .describe(
            "Natural-language topic to filter the citation graph by (e.g. 'protein folding', 'legal document understanding', 'medical imaging')"
          ),
        direction: z
          .enum(["citing", "cited_by"])
          .default("cited_by")
          .describe(
            "'citing' = outgoing references this paper cites; 'cited_by' = incoming citations from other papers"
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Number of top-ranked papers to return (max 50)"),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary,llm_novelty_score'). If omitted, returns the lean 12-field default unless verbose=true."
          ),
        verbose: z
          .boolean()
          .optional()
          .describe(
            "If true, returns the full 28-field paper shape. Default false returns the lean 12-field set. Ignored when `fields` is provided."
          ),
        exclude_ids: z
          .array(z.string())
          .optional()
          .describe(
            "arXiv IDs to exclude from results (for deduplication across chained calls)"
          ),
      },
    },
    async ({ arxiv_id, query, direction, limit, fields, verbose, exclude_ids }) => {
      try {
        const params: Record<string, string> = {
          query,
          direction,
          limit: String(limit),
        };
        if (fields !== undefined) params.fields = fields;
        if (verbose === true) params.verbose = "true";
        if (exclude_ids !== undefined && exclude_ids.length > 0)
          params.exclude_ids = exclude_ids.join(",");

        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}/citations/about`,
          params
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
