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
        "Get the SOTA leaderboard for a dataset/benchmark (e.g. ImageNet, MMLU, GSM8K, SWE-bench). Returns top methods/models ranked by score. Only includes papers with absolute numeric results. Powered by 59k+ extracted benchmark results across 20k+ datasets.",
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
      },
    },
    async ({ dataset, metric, limit }) => {
      try {
        const params: Record<string, string> = {
          dataset,
          limit: String(limit),
        };
        if (metric !== undefined) params.metric = metric;

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
