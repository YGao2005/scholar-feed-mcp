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
        "Get full details for a single paper by arXiv ID. Default returns a lean 12-field shape (arxiv_id, title, authors, year, categories, has_code, github_url, citation_count, venue_name, llm_summary, llm_significance, llm_novelty_score) plus inline benchmark results from paper_results. Pass verbose=true for the full 28-field shape with structured extraction (method_name, contribution_type, task_category, datasets, baselines) and institution_tags. Use fields='abstract' to include the abstract, or fetch_fulltext with sections='all' for the full paper.",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID e.g. '2401.12345' or '2401.12345v2'"),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary,abstract'). If omitted, returns the lean 12-field default unless verbose=true."
          ),
        verbose: z
          .boolean()
          .optional()
          .describe(
            "If true, returns the full 28-field paper shape (method/task/dataset extraction, application_domain, baselines, etc.). Default false returns the lean 12-field set. Ignored when `fields` is provided."
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
    async ({ arxiv_id, fields, verbose, include_results }) => {
      try {
        const params: Record<string, string> = {};
        if (fields !== undefined) params.fields = fields;
        if (verbose === true) params.verbose = "true";
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
