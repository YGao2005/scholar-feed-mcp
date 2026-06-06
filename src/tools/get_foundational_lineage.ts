/**
 * get_foundational_lineage tool — the foundational work for a paper's NICHE,
 * via the citation graph (consensus-then-lift). No LLM, no synthesis.
 *
 * Anchors on a paper's stored embedding, takes its k-NN neighbourhood as "the
 * niche", then ranks the papers the niche CITES: niche_roots (niche-specific
 * foundations, lift-ranked) → field_level (secondary) → discipline (universal
 * landmarks, collapsed). Surfaces canonical anchors that semantic search misses
 * — the complement to get_field_orientation (topic-anchored, retrieval-only).
 *
 * Endpoint: GET /public/foundational-lineage
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencedWithNextSteps } from "./_affordances.js";
import { asStructuredObject, lineageOutput } from "./_output.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_foundational_lineage",
    {
      title: "Get Foundational Lineage",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: lineageOutput,
      description:
        "Returns the FOUNDATIONAL WORK FOR A PAPER'S NICHE via the citation graph — the relative question ('what is foundational for THIS paper's specific sub-field', often itself only modestly cited) rather than the obvious global landmarks. Anchors on the paper, takes its embedding neighbourhood as the niche, and ranks what the niche cites into three tiers: `niche_roots` (the niche-specific foundations, ranked by how specifically the neighbourhood builds on them — surfaces canonical anchors that semantic search misses), `field_level` (broader secondary foundations), and `discipline` (universal landmarks like Attention Is All You Need, collapsed out of the way). Each paper carries `cited_by_in_niche` evidence so the claim is grounded, not asserted. Use this to trace prior art / lineage for a paper, or to find the canonical methods a niche is built on. Complements get_field_orientation (which is topic-anchored and retrieval-only). No Pro key and no LLM calls required.",
      inputSchema: {
        anchor_paper_id: z
          .string()
          .min(4)
          .max(40)
          .describe(
            "arXiv ID of the paper to anchor on, e.g. '2504.04704' or '2504.04704v2'. The niche is built from this paper's embedding neighbourhood.",
          ),
        scope: z
          .enum(["narrow", "field", "broad"])
          .default("field")
          .describe(
            "Niche breadth: 'narrow' (~100 nearest papers, tightest sub-topic — surfaces the few-citation niche root), 'field' (~200, default), 'broad' (~400, wider area foundations).",
          ),
        generality_ceiling: z
          .boolean()
          .default(true)
          .describe(
            "When true (default), demote universally-cited landmark papers into the collapsed `discipline` tier so the niche-specific foundations lead. Set false to keep landmarks in the foundational tiers.",
          ),
        limit: z
          .number()
          .int()
          .min(5)
          .max(40)
          .default(15)
          .describe(
            "Max papers in each of the niche_roots and field_level tiers (5–40, default 15).",
          ),
      },
    },
    async ({ anchor_paper_id, scope, generality_ceiling, limit }) => {
      try {
        const params: Record<string, string> = {
          anchor_paper_id,
          scope,
          generality_ceiling: String(generality_ceiling),
          limit: String(limit),
        };
        const result = await client.get<unknown>(
          "/public/foundational-lineage",
          params,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: fencedWithNextSteps(result, "lineage"),
            },
          ],
          structuredContent: asStructuredObject(result),
        };
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
