/**
 * fetch_fulltext tool — section-typed paper content from arXiv.
 *
 * Endpoint: GET /public/papers/{arxiv_id}/fulltext
 *
 * The `sections` param is sent EXPLICITLY rather than omitted. Relying on the
 * backend's implicit default meant the wire request carried no `sections` at all,
 * so the tool's documented default and the served behavior could drift apart
 * silently — which is exactly what happened when the LaTeX path broke and the
 * default mode 404'd on every paper while `sections=all` kept working.
 *
 * The default is "all". It used to be "results", which served ~800 chars — about
 * 6% of the available text — and the description then told agents not to ask for
 * more. Backing the endpoint with arXiv's LaTeXML HTML made the full-section path
 * as cheap as the lean one, so there is no longer a reason to ration it.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencedWithNextSteps } from "./_affordances.js";
import { asStructuredObject, fulltextOutput } from "./_output.js";

export function register(server: McpServer): void {
  server.registerTool(
    "fetch_fulltext",
    {
      title: "Fetch Full Text",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: fulltextOutput,
      description:
        "Read an arXiv paper's actual text, by section. Default 'all' returns every section it has — abstract, introduction, related_work, method, results, conclusion — at up to 3000 chars each plus figure/table captions. Pass a single section name to read just that one: 'method' for how it works, 'results' for the numbers it reports, 'related_work' for what it positions against. Every response lists `available_sections`, so if a paper has no related-work or results section (common in theory papers) you get that stated explicitly along with the sections it does have, not an empty answer. Sourced from arXiv's section-tagged HTML, falling back to LaTeX source then PDF text; a 404 means all three failed.",
      inputSchema: {
        arxiv_id: z.string().min(1).describe("arXiv ID of the paper"),
        sections: z
          .enum([
            "all",
            "abstract",
            "introduction",
            "related_work",
            "method",
            "results",
            "conclusion",
          ])
          .optional()
          .describe(
            "Which section to return. 'all' (default) returns every section the paper has. Name a single section to read just that one — cheaper, and enough when you only need the method or the reported numbers.",
          ),
      },
    },
    async ({ arxiv_id, sections }) => {
      try {
        // Always send the mode explicitly so the wire request matches the documented
        // default instead of depending on the backend's implicit fallback.
        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}/fulltext`,
          { sections: sections ?? "all" },
        );
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
