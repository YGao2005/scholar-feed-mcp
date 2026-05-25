/**
 * embed_text tool — embed text via Gemini Flash (768-dim).
 *
 * Endpoint: POST /public/embeddings
 * Phase 111 TOOL-02. Enables agent-side HyDE composition.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "embed_text",
    {
      description:
        "Embed a text string into a 768-dim Gemini Flash vector. Use for HyDE-style retrieval: (1) write a hypothetical short paper that would perfectly answer the user's query, (2) embed it with task_type='RETRIEVAL_DOCUMENT' (default — matches the corpus embedding side), (3) pass the resulting embedding back through search-style tools to find real papers nearest to the hypothetical. task_type='RETRIEVAL_QUERY' matches the query side and is useful for direct user-query embedding without HyDE. Cost: ~$0.0001/call; rate-limited at 30/minute per API key.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .max(8000)
          .describe(
            "Text to embed (1-8000 chars). For HyDE flows this is your hypothetical answer/abstract."
          ),
        task_type: z
          .enum(["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"])
          .optional()
          .default("RETRIEVAL_DOCUMENT")
          .describe(
            "RETRIEVAL_DOCUMENT (default) matches paper-side embeddings — use for HyDE. RETRIEVAL_QUERY matches query-side semantic search."
          ),
      },
    },
    async ({ text, task_type }) => {
      try {
        const result = await client.post<unknown>("/public/embeddings", {
          text,
          task_type,
        });
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
