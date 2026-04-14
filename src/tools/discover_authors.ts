/**
 * discover_authors tool — find researchers by topic or name.
 *
 * Endpoint: GET /public/authors/discover
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "discover_authors",
    {
      description:
        "Discover researchers by topic (semantic search) or name. For research topics like 'efficient LLM inference' or 'graph neural networks', uses embedding similarity to find relevant authors. For short name queries, uses fuzzy name matching. Returns h-index, paper counts, research topics, and rank scores.",
      inputSchema: {
        q: z
          .string()
          .min(2)
          .describe(
            "Topic or researcher name e.g. 'efficient transformer training' or 'Yann LeCun'"
          ),
        field: z
          .string()
          .optional()
          .describe(
            "Filter by primary research field e.g. 'cs.LG', 'cs.CV', 'cs.CL'"
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max results (default 20)"),
      },
    },
    async ({ q, field, limit }) => {
      try {
        const params: Record<string, string> = { q, limit: String(limit) };
        if (field !== undefined) params.field = field;

        const result = await client.get<unknown>(
          "/public/authors/discover",
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
