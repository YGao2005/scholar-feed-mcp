/**
 * search_papers tool — full-text search across Scholar Feed's 560k+ paper corpus.
 *
 * Endpoint: GET /public/papers/search
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "search_papers",
    {
      description:
        "Search Scholar Feed's 560k+ CS/AI/ML paper corpus by keyword. Returns papers with LLM-generated summaries, novelty scores, and structured extraction data (method, task, contribution type). Supports filtering by category, novelty, recency, method, task, dataset, contribution type, and whether papers have benchmark results.",
      inputSchema: {
        q: z.string().min(1).describe("Search query keywords"),
        category: z
          .string()
          .optional()
          .describe("Filter by arXiv category e.g. 'cs.AI', 'cs.LG'"),
        novelty_min: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Minimum novelty score (0-1). Use 0.5+ for novel papers."),
        days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Limit to papers published within N days"),
        method_category: z
          .string()
          .optional()
          .describe(
            "Filter by method category e.g. 'reinforcement learning', 'transformer'"
          ),
        task: z
          .string()
          .optional()
          .describe(
            "Filter by task e.g. 'image classification', 'question answering' (partial match)"
          ),
        dataset: z
          .string()
          .optional()
          .describe(
            "Filter to papers that evaluate on a specific dataset e.g. 'MMLU', 'ImageNet'"
          ),
        contribution_type: z
          .enum([
            "model",
            "method",
            "benchmark",
            "dataset",
            "survey",
            "theoretical",
            "empirical_study",
            "system",
          ])
          .optional()
          .describe(
            "Filter by paper's contribution type"
          ),
        task_category: z
          .enum([
            "NLP",
            "Computer Vision",
            "RL",
            "Audio/Speech",
            "Graphs",
            "Multimodal",
            "Systems",
            "Theory",
            "Security",
            "Other",
          ])
          .optional()
          .describe("Filter by broad research area"),
        has_results: z
          .boolean()
          .optional()
          .describe(
            "If true, only return papers with quantitative benchmark results in paper_results"
          ),
        mode: z
          .enum(["keyword", "semantic"])
          .optional()
          .describe(
            "Search mode: 'keyword' (default, full-text match) or 'semantic' (embedding similarity — finds conceptually related papers even without exact keyword matches, slower)"
          ),
        cursor: z
          .string()
          .optional()
          .describe(
            "Cursor from previous response's next_cursor for keyset pagination"
          ),
        page: z.coerce.number().int().min(1).default(1).describe("Page number"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Results per page (max 50)"),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary,llm_novelty_score'). Default: all fields."
          ),
        exclude_ids: z
          .array(z.string())
          .optional()
          .describe(
            "arXiv IDs to exclude from results (for deduplication across chained calls)"
          ),
      },
    },
    async ({
      q,
      category,
      novelty_min,
      days,
      method_category,
      task,
      dataset,
      contribution_type,
      task_category,
      has_results,
      mode,
      cursor,
      page,
      limit,
      fields,
      exclude_ids,
    }) => {
      try {
        const params: Record<string, string> = { q };
        if (category !== undefined) params.category = category;
        if (novelty_min !== undefined)
          params.novelty_min = String(novelty_min);
        if (days !== undefined) params.days = String(days);
        if (method_category !== undefined)
          params.method_category = method_category;
        if (task !== undefined) params.task = task;
        if (dataset !== undefined) params.dataset = dataset;
        if (contribution_type !== undefined)
          params.contribution_type = contribution_type;
        if (task_category !== undefined)
          params.task_category = task_category;
        if (has_results !== undefined)
          params.has_results = String(has_results);
        if (mode !== undefined) params.mode = mode;
        if (cursor !== undefined) params.cursor = cursor;
        params.page = String(page);
        params.limit = String(limit);
        if (fields !== undefined) params.fields = fields;
        if (exclude_ids !== undefined && exclude_ids.length > 0)
          params.exclude_ids = exclude_ids.join(",");

        const result = await client.get<unknown>(
          "/public/papers/search",
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
