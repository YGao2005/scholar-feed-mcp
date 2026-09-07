/**
 * fetch_fulltext tool — section-typed paper content from arXiv, one paper or a batch.
 *
 * Endpoints:
 *   GET  /public/papers/{arxiv_id}/fulltext?sections=...   (exactly one paper)
 *   POST /public/papers/fulltext                           (2..8 papers)
 *
 * WHY ONE TOOL AND NOT TWO. `surface_budget.test.ts` is a deliberate ratchet on what
 * every session pays before doing any work, and get_paper already set the precedent in
 * v3: it absorbed batch_lookup rather than standing beside it. A 28th tool would charge
 * every session for a shape that is one extra parameter here.
 *
 * WHY N=1 STILL GOES OVER GET. The single-paper response keeps its wire shape
 * (`requested_section`, `requested_section_available`, `note`), and the `sections` param
 * is sent EXPLICITLY rather than omitted — relying on the backend's implicit default
 * meant the wire request carried no `sections` at all, so the tool's documented default
 * and the served behavior could drift apart silently. That is exactly what happened when
 * the LaTeX path broke and the default mode 404'd on every paper while `sections=all`
 * kept working. Routing a one-element `arxiv_ids` through POST would give that up for
 * nothing.
 *
 * WHY NO CLIENT-SIDE "sections is required for a batch" CHECK. The backend 422s that
 * case, and a Zod `superRefine` does NOT serialise into JSON Schema — the model would
 * meet an invisible wall with no message. Let the backend's own 422 text through.
 *
 * The single-paper default is "all". It used to be "results", which served ~800 chars —
 * about 6% of the available text — and the description then told agents not to ask for
 * more. Backing the endpoint with arXiv's LaTeXML HTML made the full-section path as
 * cheap as the lean one, so there is no longer a reason to ration it. A batch has no
 * default, because 8 papers at ~13.5KB each is ~108KB of context and that is a cost the
 * caller must choose on purpose.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencedWithNextSteps } from "./_affordances.js";
import { asStructuredObject, fulltextOutput } from "./_output.js";

/** The six section names the backend serves, plus the whole-paper shorthand. */
const SECTION = z.enum([
  "all",
  "abstract",
  "introduction",
  "related_work",
  "method",
  "results",
  "conclusion",
]);

/** Max papers per batch call — matches the backend's 1..8 body constraint. */
const MAX_BATCH = 8;

export function register(server: McpServer): void {
  server.registerTool(
    "fetch_fulltext",
    {
      title: "Fetch Full Text",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: fulltextOutput,
      description:
        "Read arXiv papers' actual text, by section. Section selection controls context cost: ask for the one or two you need rather than whole papers — 'all' is ~13.5KB a paper, so a batch of 8 is ~108KB. Section labels are inferred: check `low_confidence_sections` before calling one the paper's own. Sourced from arXiv's section-tagged HTML, then LaTeX source, then PDF text; a 404 means all three failed.",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .optional()
          .describe("arXiv ID of one paper."),
        arxiv_ids: z
          .array(z.string().min(1))
          .min(1)
          .max(MAX_BATCH)
          .optional()
          .describe(
            "Up to 8 arXiv IDs, one entry per paper. `sections` is required with more than one ID.",
          ),
        sections: z
          .union([SECTION, z.array(SECTION)])
          .optional()
          .describe(
            "One section name, or an array of them. Defaults to 'all' for a single paper; no default for a batch.",
          ),
      },
    },
    async ({ arxiv_id, arxiv_ids, sections }) => {
      try {
        // `arxiv_ids` wins if both are given: it is the more specific request, and
        // merging them could push the batch past the backend's cap of 8.
        const ids =
          arxiv_ids && arxiv_ids.length > 0
            ? arxiv_ids
            : arxiv_id
              ? [arxiv_id]
              : [];
        if (ids.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: pass arxiv_id (one paper) or arxiv_ids (up to 8).",
              },
            ],
            isError: true,
          };
        }

        const wanted =
          sections === undefined
            ? undefined
            : Array.isArray(sections)
              ? sections
              : [sections];

        let result: unknown;
        if (ids.length === 1) {
          result = await client.get<unknown>(
            `/public/papers/${encodeURIComponent(ids[0])}/fulltext`,
            { sections: (wanted ?? ["all"]).join(",") },
          );
        } else {
          // `sections` is deliberately omitted when the caller omitted it: the
          // backend 422 carries the explanation, and inventing a default here
          // would silently bill the caller ~108KB of context.
          result = await client.post<unknown>("/public/papers/fulltext", {
            arxiv_ids: ids,
            ...(wanted ? { sections: wanted } : {}),
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: fencedWithNextSteps(result, "fulltext"),
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
