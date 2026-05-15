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
        "Get today's trending CS/AI papers ranked by a composite score of paper_quality, novelty, and citation_velocity. Each paper response includes trending_score plus its paper_quality and citation_velocity components so you can see why a paper was ranked highly. Papers from the last month. Default response is a lean 12-field shape per paper — pass verbose=true for the full 28-field shape.",
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
    async ({ category, limit, fields, verbose, exclude_ids }) => {
      try {
        const params: Record<string, string> = { limit: String(limit) };
        if (category !== undefined) params.category = category;
        if (fields !== undefined) params.fields = fields;
        if (verbose === true) params.verbose = "true";
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
