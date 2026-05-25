/**
 * get_author tool — DEPRECATED v3.0.0.
 *
 * Merged into find_author(id=...). Deregistered from index.ts.
 * Revival = re-add the register() call in index.ts.
 * See docs/architecture/mcp-v3-surface.md deprecation table.
 */

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
        "Get detailed author profile by ID (from discover_authors results). Returns h-index, total citations, global rank, primary field, novelty score distribution, research topics, code/venue scores, years active, and their top 10 papers by rank score (with llm_summary, novelty, citation count). Top 10 papers replaces the dropped get_author_papers tool for most use cases.",
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
