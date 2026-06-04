/**
 * get_field_orientation tool — retrieve candidate foundational papers for a
 * research topic (cheap retrieval only).
 *
 * This is the CHEAP-RETRIEVAL PRIMITIVE — it returns candidate papers ranked
 * by citation+similarity blend. It does NOT synthesize a written orientation
 * report; that synthesis is the job of the /field-guide skill, which calls
 * this tool and then composes an analysis from the candidates.
 *
 * v3 TOOL-06 wrapper half: wraps GET /public/field-orientation.
 * The /field-guide endpoint group is marked for deprecation in v10.0; this
 * cheap-retrieval endpoint migrates here as a standalone tool.
 *
 * Endpoint: GET /public/field-orientation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencePaperContent } from "./_untrusted.js";

export function register(server: McpServer): void {
  server.registerTool(
    "get_field_orientation",
    {
      title: "Get Field Orientation",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "Returns CANDIDATE FOUNDATIONAL PAPERS for a research topic — cheap retrieval only, no synthesis. Ranks papers by a blend of citation count (0.6 weight, captures importance) and semantic similarity to your topic (0.4 weight). Use this to bootstrap a literature survey or get a fast sense of the landscape. For a synthesized orientation report (key concepts, open problems, reading order), use the /field-guide skill which calls this tool internally. Does not require a Pro API key — no LLM calls are made.",
      inputSchema: {
        topic: z
          .string()
          .min(5)
          .max(300)
          .describe(
            "Research area to orient on. Be specific for better results. Examples: 'diffusion models for protein structure prediction', 'efficient attention mechanisms for long-context LLMs', 'graph neural networks for molecular property prediction'.",
          ),
        limit: z
          .number()
          .int()
          .min(5)
          .max(30)
          .default(15)
          .describe("Number of candidate papers to return (5–30, default 15)."),
      },
    },
    async ({ topic, limit }) => {
      try {
        const params: Record<string, string> = {
          topic,
          limit: String(limit),
        };
        const result = await client.get<unknown>(
          "/public/field-orientation",
          params,
        );
        return {
          content: [{ type: "text" as const, text: fencePaperContent(result) }],
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
