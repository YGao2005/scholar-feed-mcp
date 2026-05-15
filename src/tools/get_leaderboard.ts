/**
 * get_leaderboard tool — SOTA leaderboard for a dataset/benchmark.
 *
 * Endpoint: GET /public/benchmarks/leaderboard
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_leaderboard",
    {
      description:
        "Get the SOTA leaderboard for a dataset/benchmark (e.g. ImageNet, MMLU, GSM8K, SWE-bench). Returns top methods/models ranked by score across 59k+ extracted benchmark results in 20k+ datasets. Optional include_summary returns per-metric distribution stats (min/max/median/p25/p75). Optional include_history returns the most recent N chronological results per metric.",
      inputSchema: {
        dataset: z
          .string()
          .min(1)
          .describe(
            "Dataset/benchmark name e.g. 'ImageNet', 'MMLU', 'GSM8K', 'CIFAR-10', 'SWE-bench verified'"
          ),
        metric: z
          .string()
          .optional()
          .describe(
            "Specific metric to filter by e.g. 'accuracy', 'F1', 'BLEU'. If omitted, returns all metrics for the dataset."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max entries per metric (default 20)"),
        include_summary: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Include per-metric distribution summary (count, min, max, median, p25, p75)."
          ),
        include_history: z
          .number()
          .int()
          .min(0)
          .max(50)
          .optional()
          .default(0)
          .describe(
            "Include up to N most recent chronological results per metric (0 = no history). Replaces the dropped get_benchmark_timeline tool."
          ),
      },
    },
    async ({ dataset, metric, limit, include_summary, include_history }) => {
      try {
        const params: Record<string, string> = {
          dataset,
          limit: String(limit),
        };
        if (metric !== undefined) params.metric = metric;
        if (include_summary) params.include_summary = "true";
        if (include_history && include_history > 0) {
          params.include_history = String(include_history);
        }

        const result = await client.get<unknown>(
          "/public/benchmarks/leaderboard",
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
