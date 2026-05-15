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
        "Get full details for a single paper by arXiv ID. Returns title, authors, year, LLM summary, novelty score, citation count, institution tags, repo URL, venue, structured extraction (method_name, contribution_type, task_category, datasets, baselines), and inline benchmark results from paper_results (set include_results=false to skip). Use fields='abstract' to include the abstract, or fetch_fulltext with sections='all' for the full paper.",
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
        include_results: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Include inline benchmark results from paper_results. Default true. Set false if you only need metadata."
          ),
      },
    },
    async ({ arxiv_id, fields, include_results }) => {
      try {
        const params: Record<string, string> = {};
        if (fields !== undefined) params.fields = fields;
        if (include_results === false) params.include_results = "false";

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
