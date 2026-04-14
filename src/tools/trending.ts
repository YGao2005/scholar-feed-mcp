/**
 * whats_trending tool — get today's trending CS/AI papers.
 *
 * Endpoint: GET /public/trending
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "whats_trending",
    {
      description:
        "Get today's trending CS/AI papers ranked by a composite score of recency, citation velocity, and institutional reputation. Papers from the last 7 days.",
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe("arXiv category e.g. 'cs.AI', 'cs.LG', 'cs.CV'"),
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
    async ({ category, limit, fields, exclude_ids }) => {
      try {
        const params: Record<string, string> = { limit: String(limit) };
        if (category !== undefined) params.category = category;
        if (fields !== undefined) params.fields = fields;
        if (exclude_ids !== undefined && exclude_ids.length > 0)
          params.exclude_ids = exclude_ids.join(",");

        const result = await client.get<unknown>("/public/trending", params);
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
