/**
 * Note tool — annotate_paper.
 *
 * Records the user's own verdict on a paper: why it matters for their work, when to
 * use it, why it was ruled out. One note per (user, paper), upserted.
 *
 * WHY THIS EXISTS: `PUT /notes/{paper_id}` shipped long before any tool could reach
 * it — the route was JWT-only, so every API-key call got a 401, and it addressed
 * papers by internal UUID which the public API never exposes. The result was a
 * judgment layer with literally zero rows: an agent could save a paper but could not
 * record a single thing it concluded, so every verdict died at the end of the session
 * and got re-derived from the abstract next time. Both limitations were lifted
 * 2026-09-03 (require_any_auth + arXiv-ID resolution).
 *
 * The note is the ONLY durable memory across sessions. `list_library` returns
 * note_text on every saved paper, so a note written now is what a later session reads
 * instead of re-reading the paper.
 *
 * Endpoints:
 *   PUT /notes/{arxiv_id}   (upsert; body {note_text})
 *   GET /notes/{arxiv_id}   (read one)
 *
 * The backend also exposes DELETE, but this tool deliberately does not: exposing it
 * would require destructiveHint: true, which flags the common write path as dangerous
 * and discourages the exact behaviour the tool exists to encourage. A wrong note is
 * corrected by overwriting it; the web UI keeps the delete affordance.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencePaperContent } from "./_untrusted.js";
import { statusContent, statusOutput } from "./_output.js";

interface NoteResponse {
  id: string;
  paper_id: string;
  note_text: string;
  created_at: string;
  updated_at: string;
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
    "annotate_paper",
    {
      title: "Annotate Paper",
      annotations: { readOnlyHint: false, destructiveHint: false },
      outputSchema: statusOutput,
      description:
        "Record YOUR verdict on a paper — why it matters for your work, when to use it, or why you ruled it out. One note per paper, upserted (writing again replaces it), so it is safe to call repeatedly. Requires SF_API_KEY. " +
        "WHY IT MATTERS: this note is the only thing that survives between sessions. list_library returns note_text on every saved paper, so a verdict written now is what a future session reads INSTEAD of re-reading the paper and re-deriving the same conclusion. " +
        'WRITE A JUDGMENT, NOT A SUMMARY — the paper already carries llm_summary and an abstract, so restating what the paper says adds nothing. Write what those cannot: how it bears on YOUR problem. Prefer a claim someone could later prove wrong ("needs a labeled trace log we don\'t have", "our baseline — beat this on the 7B setting") over an unfalsifiable verdict ("interesting", "not very relevant"), because a mechanism can be re-checked when circumstances change and a sentiment cannot. ' +
        'State the basis when it is thin: a verdict formed from the abstract alone deserves "(abstract only)", since fetch_fulltext defaults to ~800 characters of the results section rather than the whole paper. ' +
        "Pass action='get' to read the existing note before overwriting it — worth doing when a prior session may already have judged this paper. To correct a note, just write the corrected text (it replaces).",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID of the paper to annotate, e.g. '2407.15831'."),
        note_text: z
          .string()
          .min(1)
          .max(5000)
          .optional()
          .describe(
            "Your verdict (max 5000 chars). Required for the default upsert; ignored for action='get'.",
          ),
        action: z
          .enum(["upsert", "get"])
          .default("upsert")
          .describe(
            "'upsert' (default) writes/replaces the note. 'get' returns the current note without changing it. There is deliberately no delete: a wrong note is corrected by overwriting it, which keeps this tool non-destructive.",
          ),
      },
    },
    async ({ arxiv_id, note_text, action }) => {
      const id = encodeURIComponent(arxiv_id.trim());
      try {
        if (action === "get") {
          const existing = await client.get<NoteResponse>(`/notes/${id}`);
          // A note is user-authored, but it can quote paper text — fence it.
          return text(fencePaperContent(existing), {
            ok: true,
            action: "read",
            arxiv_id,
            note_text: existing.note_text,
          });
        }

        if (!note_text || !note_text.trim()) {
          return errorResult(
            new Error("note_text is required for action='upsert'."),
          );
        }

        const saved = await client.put<NoteResponse>(`/notes/${id}`, {
          note_text: note_text.trim(),
        });
        const isUpdate = saved.updated_at !== saved.created_at;
        const msg = `${isUpdate ? "Updated" : "Saved"} your note on ${arxiv_id}. It will come back with this paper in list_library.`;
        return text(msg, {
          ok: true,
          action: isUpdate ? "updated" : "created",
          arxiv_id,
          message: msg,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
