/**
 * fetch_fulltext tool — extract paper content from arXiv LaTeX source (PDF fallback).
 *
 * Endpoint: GET /public/papers/{arxiv_id}/fulltext
 *
 * The `sections` param is sent EXPLICITLY (default "results") rather than omitted.
 * Relying on the backend's implicit default meant the wire request carried no
 * `sections` at all, so the tool's documented default and the served behavior could
 * drift apart silently — which is exactly what happened when the LaTeX path broke and
 * the default mode 404'd on every paper while `sections=all` kept working.
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
        "Extract paper content from an arXiv paper's LaTeX source, falling back to PDF text. Two modes: 'results' (default) returns ~800 chars of results/experiments + up to 3 table captions — lean, ideal for checking a reported number. 'all' returns full paper sections (abstract, introduction, related work, method, results, conclusion) at up to 3000 chars each + 5 table captions, ~15KB, so prefer 'results' unless you need the whole paper. Content is available for ~95% of arXiv papers; a 404 means neither LaTeX nor PDF extraction yielded text. May take a few seconds.",
      inputSchema: {
        arxiv_id: z.string().min(1).describe("arXiv ID of the paper"),
        sections: z
          .enum(["results", "all"])
          .optional()
          .describe(
            "'results' (default): lean ~800-char results/experiments excerpt + table captions. 'all': full paper (abstract, intro, method, results, conclusion, related work) — much larger payload.",
          ),
      },
    },
    async ({ arxiv_id, sections }) => {
      try {
        // Always send the mode explicitly so the wire request matches the documented
        // default instead of depending on the backend's implicit fallback.
        const result = await client.get<unknown>(
          `/public/papers/${encodeURIComponent(arxiv_id)}/fulltext`,
          { sections: sections ?? "results" },
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
