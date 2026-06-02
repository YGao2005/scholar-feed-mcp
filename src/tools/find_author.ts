/**
 * find_author tool — find researchers by name/topic or look up a profile by ID.
 *
 * v3: merges discover_authors + get_author into a single two-mode tool.
 *   q-mode  → GET /public/authors/discover  (semantic name/topic search)
 *   id-mode → GET /public/authors/{id}      (direct profile lookup)
 *
 * Exactly one of q or id must be provided.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencePaperContent } from "./_untrusted.js";

export function register(server: McpServer): void {
  server.registerTool(
    "find_author",
    {
      description:
        "Two-mode author tool — replaces discover_authors and get_author. Provide exactly one of q or id. Q-MODE (q=...): search for researchers by topic or name — uses embedding similarity for topics ('efficient LLM inference'), fuzzy matching for names ('Yann LeCun'). Returns a list of matching authors with author_id, name, h_index, total_papers, primary_field, research_topics. ID-MODE (id=...): look up a single author profile by author_id (obtained from a previous q-mode call or from co_author_graph results). Returns h-index, total citations, global rank, primary field, novelty score distribution, research topics, code/venue scores, years active, and their top 10 papers by rank score.",
      inputSchema: {
        q: z
          .string()
          .min(2)
          .optional()
          .describe(
            "Topic or researcher name to search (q-mode). Returns a list of matching authors. Examples: 'efficient transformer training', 'Geoffrey Hinton'.",
          ),
        id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Author ID for direct profile lookup (id-mode). Returns the single author profile with top 10 papers. Get IDs from q-mode results or co_author_graph.",
          ),
        field: z
          .string()
          .optional()
          .describe(
            "(q-mode only) Filter by primary research field e.g. 'cs.LG', 'cs.CV', 'cs.CL'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("(q-mode only) Max results to return (default 20)."),
      },
    },
    async ({ q, id, field, limit }) => {
      try {
        // Guard: exactly one of q or id must be set
        if ((q === undefined) === (id === undefined)) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Error: Provide exactly one of q (search) or id (lookup). Got " +
                  (q !== undefined && id !== undefined
                    ? "both q and id."
                    : "neither q nor id."),
              },
            ],
            isError: true,
          };
        }

        if (q !== undefined) {
          // q-mode: semantic/fuzzy author discovery
          const params: Record<string, string> = {
            q,
            limit: String(limit),
          };
          if (field !== undefined) params.field = field;

          const result = await client.get<unknown>(
            "/public/authors/discover",
            params,
          );
          return {
            content: [
              { type: "text" as const, text: fencePaperContent(result) },
            ],
          };
        } else {
          // id-mode: direct profile lookup
          const result = await client.get<unknown>(
            `/public/authors/${encodeURIComponent(String(id))}`,
          );
          return {
            content: [
              { type: "text" as const, text: fencePaperContent(result) },
            ],
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
