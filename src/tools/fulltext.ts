/**
 * fetch_fulltext tool — extract paper content from arXiv LaTeX source.
 *
 * Endpoint: GET /public/papers/{arxiv_id}/fulltext
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "fetch_fulltext",
    {
      description:
        "Extract paper content from an arXiv paper's LaTeX source. Two modes: 'results' (default) returns 800 chars of results/experiments + 3 table captions. 'all' returns full paper sections (abstract, introduction, related work, method, results, conclusion) at up to 3000 chars each + 5 table captions. ~62% of arXiv papers have LaTeX source. May take a few seconds.",
      inputSchema: {
        arxiv_id: z.string().min(1).describe("arXiv ID of the paper"),
        sections: z
          .enum(["results", "all"])
          .optional()
          .describe(
            "'results' (default): lean results section only. 'all': full paper — abstract, intro, method, results, conclusion, related work."
          ),
      },
    },
    async ({ arxiv_id, sections }) => {
      try {
        const params: Record<string, string> = {};
        if (sections !== undefined) params.sections = sections;

        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}/fulltext`,
          Object.keys(params).length > 0 ? params : undefined
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
