/**
 * co_author_graph tool — derive co-authorship edges from a set of author IDs.
 *
 * Endpoint: GET /public/authors/co-author-graph
 * Phase 111 TOOL-01.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "co_author_graph",
    {
      description:
        "Find the co-authorship neighborhood of one or more authors. Given a list of author_ids, returns edges {from, to, papers_count, last_collab_year} where 'from' is one of the input authors and 'to' is any co-author appearing on a shared paper within the window. Use for AC reviewer triage (find conflicts), disambiguating researchers (who do they actually work with?), or expanding an author seed into a research community. window_years defaults to 10. Result is capped at 500 edges, sorted by papers_count DESC.",
      inputSchema: {
        author_ids: z
          .array(z.number().int().positive())
          .min(1)
          .max(25)
          .describe(
            "Author IDs to query (1-25). Get author IDs via the discover_authors / find_author tool."
          ),
        window_years: z
          .number()
          .int()
          .min(1)
          .max(30)
          .default(10)
          .describe(
            "Only count co-authorships from the last N years (default 10, max 30)."
          ),
      },
    },
    async ({ author_ids, window_years }) => {
      try {
        const params: Record<string, string> = {
          author_ids: author_ids.join(","),
          window_years: String(window_years),
        };
        const result = await client.get<unknown>(
          "/public/authors/co-author-graph",
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
