/**
 * refine_research tool — ask a follow-up question on a completed deep_research
 * report. Finds new papers not seen in the original report and synthesizes
 * a focused follow-up analysis.
 *
 * Workflow (poll-based):
 *   1. POST /research/{report_id}/steer-async with question — returns {steer_id}
 *   2. Poll GET /research/{report_id}/steer-result/{steer_id} until complete
 *   3. Return the followup body as JSON
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 * CRITICAL: .js extensions in all relative imports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { client } from "../client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SteerStartResponse {
  steer_id: string;
  status: string;
}

interface SteerResultResponse {
  status: string;
  steer_id: string;
  followup?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Progress + polling helpers
// ---------------------------------------------------------------------------

type ExtraType = RequestHandlerExtra<ServerRequest, ServerNotification>;

async function sendProgress(
  extra: ExtraType,
  progressToken: string | number,
  progress: number,
  message: string
): Promise<void> {
  try {
    await extra.sendNotification({
      method: "notifications/progress",
      params: { progressToken, progress, total: 100, message },
    });
  } catch {
    // Non-critical
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer): void {
  server.registerTool(
    "refine_research",
    {
      description:
        "Ask a follow-up question on a completed deep_research report. " +
        "Finds new papers not seen in the original report and synthesizes " +
        "a focused follow-up analysis. Requires the report_id from a " +
        "previous deep_research call. Takes 20-60 seconds.",
      inputSchema: {
        report_id: z
          .string()
          .min(1)
          .describe("The report ID from a previous deep_research call"),
        question: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "Follow-up question or direction to explore. E.g., 'Focus more on the retrieval mechanisms' or 'What about applications in healthcare?'"
          ),
        date_from: z
          .string()
          .optional()
          .describe("Optional ISO date (YYYY-MM-DD) to filter papers from this date onward"),
        date_to: z
          .string()
          .optional()
          .describe("Optional ISO date (YYYY-MM-DD) to filter papers up to this date"),
        cluster_label: z
          .string()
          .optional()
          .describe(
            "Optional cluster label from the original report to focus the follow-up on a specific research direction"
          ),
      },
    },
    async ({ report_id, question, date_from, date_to, cluster_label }, extra) => {
      const progressToken = extra._meta?.progressToken;

      try {
        // Step 1: Start steer asynchronously
        if (progressToken !== undefined) {
          await sendProgress(extra, progressToken, 10, "Starting follow-up research...");
        }

        const body: Record<string, string> = { question };
        if (date_from) body.date_from = date_from;
        if (date_to) body.date_to = date_to;
        if (cluster_label) body.cluster_label = cluster_label;

        const startResult = await client.post<SteerStartResponse>(
          `/research/${report_id}/steer-async`,
          body
        );

        console.error(`[refine_research] Started: steer_id=${startResult.steer_id}`);

        if (progressToken !== undefined) {
          await sendProgress(extra, progressToken, 20, "Follow-up research in progress...");
        }

        // Step 2: Poll for result (max 3 minutes)
        const maxWaitMs = 3 * 60 * 1000;
        const pollIntervalMs = 3_000;
        const startTime = Date.now();
        let pollCount = 0;

        while (Date.now() - startTime < maxWaitMs) {
          await sleep(pollIntervalMs);
          pollCount++;

          let result: SteerResultResponse;
          try {
            result = await client.get<SteerResultResponse>(
              `/research/${report_id}/steer-result/${startResult.steer_id}`
            );
          } catch (err: unknown) {
            console.error(`[refine_research] Poll ${pollCount} failed:`, err);
            continue;
          }

          // 202 returns {status: "processing"} — keep polling
          if (result.status === "processing") {
            if (progressToken !== undefined) {
              const elapsed = (Date.now() - startTime) / 1000;
              const pct = Math.min(20 + Math.floor(elapsed), 90);
              await sendProgress(
                extra,
                progressToken,
                pct,
                `Follow-up in progress... (${Math.round(elapsed)}s)`
              );
            }
            continue;
          }

          console.error(
            `[refine_research] Poll ${pollCount}: status=${result.status}`
          );

          if (result.status === "complete" && result.followup) {
            if (progressToken !== undefined) {
              await sendProgress(extra, progressToken, 100, "Follow-up complete");
            }

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result.followup, null, 2),
                },
              ],
            };
          }
        }

        throw new Error(
          "Follow-up research timed out after 3 minutes. The original report may be too large for follow-up."
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[refine_research] Error:", message);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
