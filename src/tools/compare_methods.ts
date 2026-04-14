/**
 * compare_methods tool — compare models/methods across shared benchmarks.
 *
 * Endpoint: POST /public/methods/compare
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "compare_methods",
    {
      description:
        "Compare 2-10 models/methods side-by-side across shared benchmarks. Finds datasets where at least 2 of the specified models have been evaluated, enabling direct score comparison. Example: compare GPT-4, LLaMA-3, and Mistral across MMLU, GSM8K, etc.",
      inputSchema: {
        models: z
          .array(z.string())
          .min(2)
          .max(10)
          .describe(
            "Model/method names to compare e.g. ['GPT-4', 'LLaMA-3', 'Mistral']"
          ),
        dataset: z
          .string()
          .optional()
          .describe("Filter to a specific dataset e.g. 'MMLU'"),
        metric: z
          .string()
          .optional()
          .describe("Filter to a specific metric e.g. 'accuracy'"),
      },
    },
    async ({ models, dataset, metric }) => {
      try {
        const body: Record<string, unknown> = { models };
        if (dataset !== undefined) body.dataset = dataset;
        if (metric !== undefined) body.metric = metric;

        const result = await client.post<unknown>(
          "/public/methods/compare",
          body
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
