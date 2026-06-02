/**
 * Ask-My-Library tool — ask_library.
 *
 * "Answer my question using my saved set." The backend retrieves the most relevant
 * papers from the user's library (or one collection), then synthesizes a cited
 * answer grounded ONLY in that set. The inverse of find_gaps (which surfaces what
 * the user is MISSING). Read-only.
 *
 * Requires SF_API_KEY (it reads the user's saved set). Free accounts get 1
 * question/month; beyond that the backend returns a { error, message } upgrade
 * prompt that client.ts surfaces verbatim. Pro raises this to 200/day.
 *
 * Endpoint:
 *   GET /ask  (?question=, [&collection_name= | &collection_id=], &limit=)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencePaperContent } from "./_untrusted.js";

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export function register(server: McpServer): void {
  server.registerTool(
    "ask_library",
    {
      description:
        "Answer a question using ONLY the papers you've saved — a synthesis over your library (or one collection) with inline [arXiv-ID] citations. The inverse of find_gaps (which finds important work you're MISSING): ask_library reasons over what you HAVE. Optionally scope to one collection (collection_name OR collection_id); omit both to use your whole library. Read-only. Requires SF_API_KEY (it reads your saved set). Free accounts get 1 question/month; Pro raises this to 200/day.",
      inputSchema: {
        question: z
          .string()
          .min(5)
          .max(500)
          .describe(
            "The natural-language question to answer from your saved papers.",
          ),
        collection_name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Scope the answer to one collection by name (resolved by the backend). Omit to use your whole library.",
          ),
        collection_id: z
          .string()
          .optional()
          .describe(
            "Scope the answer to one collection by UUID. Omit to use your whole library.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(8)
          .describe(
            "How many of your most-relevant saved papers to ground the answer on (max 20). Default 8.",
          ),
      },
    },
    async ({ question, collection_name, collection_id, limit }) => {
      try {
        if (collection_name && collection_id) {
          return errorResult(
            new Error(
              "Provide at most one of collection_name or collection_id.",
            ),
          );
        }
        const params: Record<string, string> = {
          question,
          limit: String(limit),
        };
        if (collection_name) params.collection_name = collection_name;
        if (collection_id) params.collection_id = collection_id;
        const result = await client.get<unknown>("/ask", params);
        return text(fencePaperContent(result)); // answer synthesised over papers = untrusted
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
