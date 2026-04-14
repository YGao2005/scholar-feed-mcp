/**
 * deep_research tool — runs a full Scholar Feed research session and returns
 * the completed report as JSON.
 *
 * Workflow (poll-based — reliable over MCP transport):
 *   1. POST /research/start with topic + depth — returns {report_id} immediately
 *   2. Poll GET /research/{report_id} every 5s until status='complete' or 'error'
 *   3. Return the full report as JSON text content
 *
 * This replaces the previous SSE-based approach which was unreliable over the
 * MCP stdio transport layer (Claude Code's transport has its own timeout that
 * is shorter than the ~2min research takes).
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

interface StartResponse {
  report_id: string;
  status: string;
}

interface ResearchReport {
  id: string;
  topic: string;
  status: string;
  paper_count: number;
  depth: string;
  report_body: unknown;
  error_message?: string;
  papers?: unknown[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Progress notification helper
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
      params: {
        progressToken,
        progress,
        total: 100,
        message,
      },
    });
  } catch (err) {
    // Non-critical — continue silently
    console.error("[deep_research] Failed to send progress notification:", err);
  }
}

// ---------------------------------------------------------------------------
// Polling helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll GET /research/{reportId} until status is 'complete' or 'error'.
 * Sends progress notifications during polling.
 *
 * Timeout: 10 minutes total (covers deep: ~300s + synthesis time).
 */
async function pollUntilComplete(
  reportId: string,
  progressToken: string | number | undefined,
  extra: ExtraType
): Promise<ResearchReport> {
  const maxWaitMs = 10 * 60 * 1000; // 10 minutes
  const pollIntervalMs = 5_000; // 5 seconds
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(pollIntervalMs);
    pollCount++;

    let report: ResearchReport;
    try {
      report = await client.get<ResearchReport>(`/research/${reportId}`);
    } catch (err) {
      console.error(`[deep_research] Poll ${pollCount} failed:`, err);
      // Transient error — keep polling
      continue;
    }

    console.error(`[deep_research] Poll ${pollCount}: status=${report.status}`);

    if (report.status === "complete") {
      if (progressToken !== undefined) {
        await sendProgress(extra, progressToken, 100, "Research complete");
      }
      return report;
    }

    if (report.status === "error") {
      const errorMsg = report.error_message || "Research agent encountered an error";
      throw new Error(`Research failed: ${errorMsg}`);
    }

    // Still running — send progress notification
    if (progressToken !== undefined) {
      // Estimate progress: ramp from 10% to 90% over ~3 minutes
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = Math.min(10 + Math.floor(elapsed / 2), 90);
      await sendProgress(extra, progressToken, pct, `Research in progress... (${Math.round(elapsed)}s)`);
    }
  }

  throw new Error("Research timed out after 10 minutes. Try 'quick' depth for faster results.");
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer): void {
  server.registerTool(
    "deep_research",
    {
      description:
        "Run a deep research session on a topic. Searches 560k+ CS/AI papers, " +
        "synthesizes findings with an LLM into a structured report with clusters, " +
        "gap analysis, and evidence chains. Takes 60-300 seconds depending on depth. " +
        "The 'quick' depth (~60s) is most reliable. " +
        "Requires an API key (free at scholarfeed.org/settings). " +
        "Returns the full structured report as JSON.",
      inputSchema: {
        topic: z.string().min(1).describe("Research topic or question"),
        depth: z
          .enum(["quick", "standard", "deep"])
          .default("standard")
          .describe(
            "quick: ~60s, 1 retrieval round. standard: ~120s, 2-3 rounds. deep: ~300s, 4-5 rounds with full-text evidence."
          ),
      },
    },
    async ({ topic, depth }, extra) => {
      const progressToken = extra._meta?.progressToken;

      try {
        // Step 1: Start research asynchronously — returns immediately
        if (progressToken !== undefined) {
          await sendProgress(extra, progressToken, 5, "Starting research agent...");
        }

        const startResult = await client.post<StartResponse>("/research/start", {
          topic,
          depth,
        });

        console.error(`[deep_research] Started: report_id=${startResult.report_id}`);

        if (progressToken !== undefined) {
          await sendProgress(extra, progressToken, 10, "Research session started, processing...");
        }

        // Step 2: Poll until complete
        const report = await pollUntilComplete(startResult.report_id, progressToken, extra);

        // Step 3: Return the full report
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(report, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[deep_research] Error:", message);

        // Provide actionable guidance for auth errors
        if (message.includes("Authentication failed") || message.includes("401")) {
          return {
            content: [{
              type: "text" as const,
              text: "Error: Deep research requires an API key. Get one free at https://www.scholarfeed.org/settings and add it as SF_API_KEY in your MCP config.",
            }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
