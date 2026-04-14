/**
 * get_research_landscape tool — aggregated field-level statistics.
 *
 * Endpoint: GET /public/research/landscape
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_research_landscape",
    {
      description:
        "Get aggregated research landscape statistics for a topic. Uses semantic search to find relevant papers, then returns count-based aggregates: methods used (with paper counts), benchmarks evaluated (with paper counts), active authors, contribution type distribution, publication velocity by month, and novelty score distribution. All data is factual counts — no rankings or editorial labels.",
      inputSchema: {
        q: z
          .string()
          .min(2)
          .describe(
            "Research topic e.g. 'efficient LLM inference', 'protein folding', 'autonomous driving perception'"
          ),
        limit: z
          .coerce.number()
          .int()
          .min(10)
          .max(200)
          .default(50)
          .describe(
            "Number of papers to analyze (10-200, default 50). More papers = broader but slower."
          ),
      },
    },
    async ({ q, limit }) => {
      try {
        const params: Record<string, string> = { q, limit: String(limit) };
        const result = await client.get<unknown>(
          "/public/research/landscape",
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
