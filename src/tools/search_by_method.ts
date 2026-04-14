/**
 * search_by_method tool — find papers by method/technique name.
 *
 * Endpoint: GET /public/methods/search
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "search_by_method",
    {
      description:
        "Search papers by method or technique name (e.g. 'LoRA', 'YOLO', 'DPO', 'attention'). Unlike keyword search, this searches the structured method_name field extracted from 78k+ papers. Returns papers that introduce or evaluate the method, with benchmark result counts.",
      inputSchema: {
        q: z
          .string()
          .min(1)
          .describe("Method or technique name e.g. 'LoRA', 'YOLO', 'DPO'"),
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
          .describe("Filter by contribution type"),
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
          .describe("Filter by research area"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max results (default 20)"),
      },
    },
    async ({ q, contribution_type, task_category, limit }) => {
      try {
        const params: Record<string, string> = { q, limit: String(limit) };
        if (contribution_type !== undefined)
          params.contribution_type = contribution_type;
        if (task_category !== undefined)
          params.task_category = task_category;

        const result = await client.get<unknown>(
          "/public/methods/search",
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
