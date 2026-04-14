/**
 * get_author tool — get author profile with stats and top papers.
 *
 * Endpoint: GET /public/authors/{author_id}
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_author",
    {
      description:
        "Get detailed author profile by ID (from discover_authors results). Returns h-index, total citations, global rank, research topics, novelty scores, and their top 10 papers by rank score.",
      inputSchema: {
        author_id: z
          .coerce.number()
          .int()
          .describe("Author ID (from discover_authors results)"),
      },
    },
    async ({ author_id }) => {
      try {
        const result = await client.get<unknown>(
          `/public/authors/${author_id}`
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
