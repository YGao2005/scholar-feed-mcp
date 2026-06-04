/**
 * Gap-analysis tool — find_gaps.
 *
 * "What am I missing?" for a collection or topic. Surfaces important work the
 * user has NOT saved, in two buckets:
 *   - foundational_gaps: canonical citation-graph anchors in the niche (lineage,
 *     aggregated across the seed) that aren't already in the user's library.
 *   - frontier_gaps: recent high-novelty papers in the niche not yet saved.
 *
 * The backend derives the niche from the seed, runs lineage + recent-novelty
 * search (reusing get_foundational_lineage / search internals), and subtracts the
 * user's saved set — so this REQUIRES an SF_API_KEY (it needs the library to
 * subtract). Read-only. It is a Pro feature: free accounts get a { error, message }
 * upgrade prompt from the backend, surfaced verbatim by client.ts.
 *
 * Endpoint:
 *   GET /gaps  (?collection_name= | ?collection_id= | ?topic=, &scope=, &limit=)
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
    "find_gaps",
    {
      title: "Find Research Gaps",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Find important work you HAVEN'T saved, for a collection or topic — a 'what am I missing?' analysis. Returns two buckets: foundational_gaps (canonical citation-graph anchors in the niche, not in your library) and frontier_gaps (recent high-novelty work in the niche, not yet saved). Provide exactly one seed: collection_name OR collection_id OR topic. The backend derives the niche, runs lineage + recent-novelty search, and subtracts your saved set. Read-only. Requires SF_API_KEY (it needs your library to subtract) and is a Pro feature — free accounts receive an upgrade prompt.",
      inputSchema: {
        collection_name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Analyze gaps for a collection by name (resolved by the backend). Provide exactly one seed.",
          ),
        collection_id: z
          .string()
          .optional()
          .describe(
            "Analyze gaps for a collection by UUID. Provide exactly one seed.",
          ),
        topic: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Analyze gaps for a free-text topic/area. Provide exactly one seed.",
          ),
        scope: z
          .enum(["foundational", "frontier", "both"])
          .default("both")
          .describe(
            "Which gaps to surface: 'foundational' (canonical anchors you're missing), 'frontier' (recent novel work you haven't saved), or 'both' (default).",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Max gaps per bucket (max 50). Default 10."),
      },
    },
    async ({ collection_name, collection_id, topic, scope, limit }) => {
      try {
        const seeds = (
          [
            ["collection_name", collection_name],
            ["collection_id", collection_id],
            ["topic", topic],
          ] as Array<[string, string | undefined]>
        ).filter(([, v]) => v !== undefined) as Array<[string, string]>;
        if (seeds.length !== 1) {
          return errorResult(
            new Error(
              "Provide exactly one seed: collection_name, collection_id, or topic.",
            ),
          );
        }
        const params: Record<string, string> = {
          [seeds[0][0]]: seeds[0][1],
          scope,
          limit: String(limit),
        };
        const result = await client.get<unknown>("/gaps", params);
        return text(fencePaperContent(result)); // gap analysis over papers = untrusted
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
