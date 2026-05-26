/**
 * get_citations tool — fetch the citation graph for a paper.
 *
 * Endpoint: GET /public/papers/{arxiv_id}/citations
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_citations",
    {
      description:
        "Get the citation graph for a paper, sorted by citing-paper rank_score (highest-impact first). 'citing' = outgoing references this paper cites; 'cited_by' = incoming citations from other papers. Default response is a lean 12-field shape per paper — pass verbose=true for the full 28-field shape.",
      inputSchema: {
        arxiv_id: z.string().min(1).describe("arXiv ID of the paper"),
        direction: z
          .enum(["citing", "cited_by"])
          .default("cited_by")
          .describe(
            "'citing' = outgoing references this paper cites; 'cited_by' = incoming citations from other papers",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Number of papers to return (max 50)"),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary,llm_novelty_score'). If omitted, returns the lean 12-field default unless verbose=true.",
          ),
        verbose: z
          .boolean()
          .optional()
          .describe(
            "If true, returns the full 28-field paper shape. Default false returns the lean 12-field set. Ignored when `fields` is provided.",
          ),
        exclude_ids: z
          .array(z.string())
          .optional()
          .describe(
            "arXiv IDs to exclude from results (for deduplication across chained calls)",
          ),
      },
    },
    async ({ arxiv_id, direction, limit, fields, verbose, exclude_ids }) => {
      try {
        const params: Record<string, string> = {
          direction,
          limit: String(limit),
        };
        if (fields !== undefined) params.fields = fields;
        if (verbose === true) params.verbose = "true";
        if (exclude_ids !== undefined && exclude_ids.length > 0)
          params.exclude_ids = exclude_ids.join(",");

        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}/citations`,
          params,
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
    },
  );
}
