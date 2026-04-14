/**
 * get_author_papers tool — get all papers by an author.
 *
 * Endpoint: GET /public/authors/{author_id}/papers
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_author_papers",
    {
      description:
        "Get all papers by an author (paginated, sorted by rank score). Use discover_authors to find the author_id first. Returns the same paper fields as search_papers.",
      inputSchema: {
        author_id: z
          .coerce.number()
          .int()
          .describe("Author ID (from discover_authors or get_author results)"),
        limit: z
          .coerce.number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Papers per page (max 50)"),
        page: z
          .coerce.number()
          .int()
          .min(1)
          .default(1)
          .describe("Page number"),
      },
    },
    async ({ author_id, limit, page }) => {
      try {
        const params: Record<string, string> = {
          limit: String(limit),
          page: String(page),
        };
        const result = await client.get<unknown>(
          `/public/authors/${author_id}/papers`,
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
