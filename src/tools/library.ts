/**
 * Library write/read tools — save_paper, unsave_paper, like_paper, list_library.
 *
 * These MUTATE the authenticated user's library and personalization. They require
 * an SF_API_KEY (the sf_ key resolves to the same account that owns the website
 * library); without a key the backend rejects the request and the tool surfaces it.
 *
 * Idempotency note: /interactions/save TOGGLES, which is agent-hostile (a retried
 * call would undo itself). save_paper / unsave_paper read the toggle's own
 * {action: "added"|"removed"} response and self-correct to the desired END STATE,
 * so they are safe to call repeatedly. like_paper uses /interactions/boost, which
 * is INSERT-only (idempotent) and records a "more like this" signal.
 *
 * Paper references are arXiv IDs (e.g. "2407.15831" or "2407.15831v2") — the backend
 * resolves arXiv → internal id on the write path.
 *
 * Endpoints:
 *   POST /interactions/save   (toggle; body {paper_id})
 *   POST /interactions/boost  (insert-only 'like'; body {paper_id})
 *   GET  /library             (saved papers)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencePaperContent } from "./_untrusted.js";
import {
  asStructuredObject,
  papersOutput,
  statusContent,
  statusOutput,
} from "./_output.js";

interface ToggleResult {
  success: boolean;
  action: string; // 'added' | 'removed'
  paper_id: string;
}

function text(t: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: t }],
    structuredContent: structured ?? statusContent(t),
  };
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
    "save_paper",
    {
      title: "Save Paper",
      annotations: { readOnlyHint: false, destructiveHint: false },
      outputSchema: statusOutput,
      description:
        "Save a paper to the authenticated user's Scholar Feed library (bookmark). MUTATES the library and feeds the user's personalization — saved papers are the strongest signal in the For You feed and the email digest. Idempotent: calling it again on an already-saved paper leaves it saved. Requires SF_API_KEY. To file it into a named collection in one step, use add_to_collection (that also saves).",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID of the paper to save, e.g. '2407.15831'."),
      },
    },
    async ({ arxiv_id }) => {
      try {
        const r1 = await client.post<ToggleResult>("/interactions/save", {
          paper_id: arxiv_id,
        });
        if (r1.action === "removed") {
          // It was already saved; the toggle just removed it — restore it.
          await client.post<ToggleResult>("/interactions/save", {
            paper_id: arxiv_id,
          });
          return text(`Already in your library (no change): ${arxiv_id}`, {
            ok: true,
            action: "no_change",
            arxiv_id,
            message: `Already in your library (no change): ${arxiv_id}`,
          });
        }
        return text(`Saved to your library: ${arxiv_id}`, {
          ok: true,
          action: "saved",
          arxiv_id,
          message: `Saved to your library: ${arxiv_id}`,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "unsave_paper",
    {
      title: "Unsave Paper",
      annotations: { readOnlyHint: false, destructiveHint: true },
      outputSchema: statusOutput,
      description:
        "Remove a paper from the authenticated user's Scholar Feed library. MUTATES the library. Idempotent: removing a paper that isn't saved leaves it unsaved. Note: the saved library is a superset of all collections, so un-saving a paper ALSO removes it from every collection it was in. To keep it filed in a collection, use remove_from_collection instead (that leaves the paper saved). Requires SF_API_KEY.",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID of the paper to remove from the library."),
      },
    },
    async ({ arxiv_id }) => {
      try {
        const r1 = await client.post<ToggleResult>("/interactions/save", {
          paper_id: arxiv_id,
        });
        if (r1.action === "added") {
          // It wasn't saved; the toggle just added it — undo to leave it unsaved.
          await client.post<ToggleResult>("/interactions/save", {
            paper_id: arxiv_id,
          });
          return text(
            `Paper was not in your library (no change): ${arxiv_id}`,
            {
              ok: true,
              action: "no_change",
              arxiv_id,
              message: `Paper was not in your library (no change): ${arxiv_id}`,
            },
          );
        }
        return text(`Removed from your library: ${arxiv_id}`, {
          ok: true,
          action: "removed",
          arxiv_id,
          message: `Removed from your library: ${arxiv_id}`,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "like_paper",
    {
      title: "Like Paper",
      annotations: { readOnlyHint: false, destructiveHint: false },
      outputSchema: statusOutput,
      description:
        "Like a paper — a 'more like this' calibration signal that tunes the user's For You feed toward similar work. INSERT-only and idempotent (liking twice is a no-op, never un-likes). Distinct from save_paper: like expresses taste for ranking; save bookmarks for later reading. Requires SF_API_KEY.",
      inputSchema: {
        arxiv_id: z.string().min(1).describe("arXiv ID of the paper to like."),
      },
    },
    async ({ arxiv_id }) => {
      try {
        await client.post("/interactions/boost", { paper_id: arxiv_id });
        return text(
          `Liked ${arxiv_id} — your feed will lean toward similar papers.`,
          {
            ok: true,
            action: "liked",
            arxiv_id,
            message: `Liked ${arxiv_id} — your feed will lean toward similar papers.`,
          },
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_library",
    {
      title: "List Library",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: papersOutput,
      description:
        "List the authenticated user's saved papers (their library), newest first. Read-only. Use this to review a reading list or to see what's already saved before saving more. Requires SF_API_KEY.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("How many saved papers to return (max 100)."),
        page: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("Page number for paging through a large library."),
      },
    },
    async ({ limit, page }) => {
      try {
        const result = await client.get<unknown>("/library", {
          limit: String(limit),
          page: String(page),
        });
        // saved papers = untrusted content
        return text(fencePaperContent(result), asStructuredObject(result));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
