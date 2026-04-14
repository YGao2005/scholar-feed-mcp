/**
 * find_similar tool — find papers similar to a given paper.
 *
 * Endpoint: GET /public/papers/{arxiv_id}/similar
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "find_similar",
    {
      description:
        "Find papers similar to a given paper. Uses precomputed bibliographic coupling + embedding similarity (updated daily).",
      inputSchema: {
        arxiv_id: z.string().min(1).describe("arXiv ID of the source paper"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .default(10)
          .describe("Number of similar papers to return (max 30)"),
        days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Filter similar papers published within N days"),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary,llm_novelty_score'). Default: all fields."
          ),
        exclude_ids: z
          .array(z.string())
          .optional()
          .describe(
            "arXiv IDs to exclude from results (for deduplication across chained calls)"
          ),
      },
    },
    async ({ arxiv_id, limit, days, fields, exclude_ids }) => {
      try {
        const params: Record<string, string> = { limit: String(limit) };
        if (days !== undefined) params.days = String(days);
        if (fields !== undefined) params.fields = fields;
        if (exclude_ids !== undefined && exclude_ids.length > 0)
          params.exclude_ids = exclude_ids.join(",");

        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}/similar`,
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
