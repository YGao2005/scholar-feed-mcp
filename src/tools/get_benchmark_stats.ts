/**
 * get_benchmark_stats tool — score distribution statistics for a benchmark.
 *
 * Endpoint: GET /public/benchmarks/stats
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_benchmark_stats",
    {
      description:
        "Get score distribution statistics for a dataset+metric across all papers. Returns min, max, median, mean, p25, p75, stddev, and count. Use this to contextualize a paper's claims — e.g., 'For MMLU accuracy, the median is 72.5% across 45 papers, range 33%-95%.' No judgment or outlier flags — just raw statistics.",
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
          "/public/benchmarks/stats",
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
