/**
 * get_paper tool — fetch full details for a single paper by arXiv ID.
 *
 * Endpoint: GET /public/papers/{arxiv_id}
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_paper",
    {
      description:
        "Get full details for a single paper by arXiv ID. Returns title, authors, year, LLM summary, novelty score, links, and structured extraction data (method_name, contribution_type, task_category, datasets, baselines). Use fields='abstract' to include the abstract. Use get_paper_results for benchmark scores, or fetch_fulltext with sections='all' for the full paper content.",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID e.g. '2401.12345' or '2401.12345v2'"),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary,abstract'). Default: all fields."
          ),
      },
    },
    async ({ arxiv_id, fields }) => {
      try {
        const params: Record<string, string> = {};
        if (fields !== undefined) params.fields = fields;

        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}`,
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
