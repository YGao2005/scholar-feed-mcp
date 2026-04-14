/**
 * fetch_repo tool — get GitHub repository summary for a paper.
 *
 * Endpoint: GET /public/papers/{arxiv_id}/repo
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "fetch_repo",
    {
      description:
        "Get the GitHub repository summary for a paper — README content and file tree. Only works for papers with an associated code URL.",
      inputSchema: {
        arxiv_id: z.string().min(1).describe("arXiv ID of the paper"),
      },
    },
    async ({ arxiv_id }) => {
      try {
        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}/repo`
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
