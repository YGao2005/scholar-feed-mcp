/**
 * get_paper_results tool — get structured benchmark results for a paper.
 *
 * Endpoint: GET /public/papers/{arxiv_id}/results
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_paper_results",
    {
      description:
        "Get structured benchmark results for a paper. Returns quantitative results extracted from the paper: datasets evaluated, metrics, numeric scores, model comparisons, and baselines. Use this after get_paper to see how a paper performed on benchmarks.",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID e.g. '2401.12345'"),
      },
    },
    async ({ arxiv_id }) => {
      try {
        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}/results`
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
