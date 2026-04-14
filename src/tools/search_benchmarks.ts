/**
 * search_benchmarks tool — search for datasets/benchmarks by name.
 *
 * Endpoint: GET /public/benchmarks/search
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "search_benchmarks",
    {
      description:
        "Search for datasets/benchmarks by name. Returns matching benchmark names with paper counts and available metrics. Use this to find the exact benchmark name before calling get_leaderboard. Covers 20k+ datasets from 24k+ papers.",
      inputSchema: {
        q: z
          .string()
          .min(1)
          .describe(
            "Dataset/benchmark name to search for e.g. 'imagenet', 'mmlu', 'coco'"
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max results (default 20)"),
      },
    },
    async ({ q, limit }) => {
      try {
        const params: Record<string, string> = { q, limit: String(limit) };

        const result = await client.get<unknown>(
          "/public/benchmarks/search",
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
