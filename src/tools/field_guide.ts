/**
 * field_guide tool — generate a curated orientation report on a research area.
 *
 * Endpoints:
 *   POST /field-guide/start         — kick off background run, returns report_id
 *   GET  /field-guide/{report_id}   — poll until status=complete|error
 *
 * The Field Guide is Scholar Feed's headline differentiator: pre-synthesized,
 * curated structure (foundational papers, competing approaches, open problems,
 * reading order, subfield map) — not a prompt template that makes the LLM read
 * 50 papers itself.
 *
 * Monthly quota: 1/month free, 20/month Pro. Quota only increments on a
 * successful 'complete' status (errors are free).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

interface StartResponse {
  report_id: string;
  status: string;
}

interface PollResponse {
  id: string;
  topic: string;
  status: "running" | "retrieving" | "synthesizing" | "complete" | "error";
  paper_count: number;
  report_body: Record<string, unknown> | null;
  error_message: string | null;
  papers?: Array<Record<string, unknown>>;
  created_at: string;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1_000; // 5 min — backend caps at 300s anyway

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function register(server: McpServer): void {
  server.registerTool(
    "field_guide",
    {
      description:
        "Generate a curated orientation report for entering a research area. " +
        "Returns foundational papers with rationale, competing approaches, " +
        "open problems with supporting papers, a sequenced reading order, " +
        "and a subfield map — synthesized across ~20 papers selected from a " +
        "600k-paper corpus by DeepSeek. Designed for 'I'm new to X — where " +
        "do I start?' queries. Runs ~30-60s. Monthly quota: 1 free, 20 Pro.",
      inputSchema: {
        topic: z
          .string()
          .min(5)
          .max(300)
          .describe(
            "The research area to orient on. Be specific. " +
              "Good: 'diffusion models for protein structure prediction'. " +
              "Vague: 'AI'."
          ),
      },
    },
    async ({ topic }) => {
      try {
        const start = await client.post<StartResponse>("/field-guide/start", {
          topic,
        });
        const reportId = start.report_id;

        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let last: PollResponse | null = null;

        while (Date.now() < deadline) {
          last = await client.get<PollResponse>(`/field-guide/${reportId}`);
          if (last.status === "complete" || last.status === "error") break;
          await sleep(POLL_INTERVAL_MS);
        }

        if (!last) {
          return {
            content: [
              { type: "text" as const, text: "Error: no response from field guide service" },
            ],
            isError: true,
          };
        }

        if (last.status === "error") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Field guide failed: ${last.error_message ?? "unknown error"}`,
              },
            ],
            isError: true,
          };
        }

        if (last.status !== "complete") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Field guide timed out after 5 minutes (last status: ${last.status}). Try a more specific topic.`,
              },
            ],
            isError: true,
          };
        }

        // Pull report_body fields up + include papers list. report_body keys:
        // foundational_papers, approaches, open_problems, reading_order, subfield_map, warning?
        const body = last.report_body ?? {};
        const output = {
          topic: last.topic,
          paper_count: last.paper_count,
          ...body,
          papers: last.papers ?? [],
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(output, null, 2) },
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
