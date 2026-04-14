/**
 * get_benchmark_timeline tool — raw score data points over time.
 *
 * Endpoint: GET /public/benchmarks/timeline
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_benchmark_timeline",
    {
      description:
        "Get raw benchmark score data points over time for a dataset+metric. Returns individual (paper, date, score, value_string) entries ordered chronologically. No trend lines or interpretation — raw scatter data. Use search_benchmarks first to find the exact dataset and metric names.",
      inputSchema: {
        dataset: z
          .string()
          .min(1)
          .describe("Dataset/benchmark name e.g. 'ImageNet', 'MMLU', 'SWE-bench Verified'"),
        metric: z
          .string()
          .min(1)
          .describe("Metric name e.g. 'accuracy', 'F1', 'pass@1'"),
      },
    },
    async ({ dataset, metric }) => {
      try {
        const result = await client.get<unknown>(
          "/public/benchmarks/timeline",
          { dataset, metric }
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
