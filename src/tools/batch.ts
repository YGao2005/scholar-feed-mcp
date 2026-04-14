/**
 * batch_lookup tool — look up multiple papers at once by arXiv ID.
 *
 * Endpoint: POST /public/papers/batch
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "batch_lookup",
    {
      description:
        "Look up multiple papers at once by arXiv ID. Returns details for found papers and lists not-found IDs.",
      inputSchema: {
        arxiv_ids: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("List of arXiv IDs (max 50)"),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary'). Default: all fields."
          ),
      },
    },
    async ({ arxiv_ids, fields }) => {
      try {
        const body: Record<string, unknown> = { arxiv_ids };
        if (fields !== undefined) body.fields = fields;

        const result = await client.post<unknown>("/public/papers/batch", body);
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
