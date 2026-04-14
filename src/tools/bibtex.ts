/**
 * export_bibtex tool — generate BibTeX entries for arXiv papers.
 *
 * Endpoint: POST /public/papers/bibtex
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

interface BibtexResponse {
  bibtex: string;
  count: number;
  not_found: string[];
}

export function register(server: McpServer): void {
  server.registerTool(
    "export_bibtex",
    {
      description:
        "Export BibTeX entries for one or more arXiv papers. Returns formatted BibTeX text ready for use in LaTeX documents or reference managers.",
      inputSchema: {
        arxiv_ids: z
          .array(z.string())
          .min(1)
          .max(50)
          .describe("List of arXiv IDs (max 50)"),
      },
    },
    async ({ arxiv_ids }) => {
      try {
        const result = await client.post<BibtexResponse>(
          "/public/papers/bibtex",
          { arxiv_ids }
        );

        let text = result.bibtex;
        if (result.not_found.length > 0) {
          text += `\n\n% Not found: ${result.not_found.join(", ")}`;
        }

        return {
          content: [{ type: "text" as const, text }],
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
