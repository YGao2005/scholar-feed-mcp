/**
 * get_paper tool — fetch details for one or more papers by arXiv ID.
 *
 * v3 changes:
 *   - arxiv_ids: string[]  (required array; single-paper = [id])
 *   - format: 'json' | 'bibtex'  — bibtex replaces removed export_bibtex tool
 *   - batch (len >= 1) calls GET /public/papers?arxiv_ids[]=...  (Branch A;
 *     POST /papers/batch was retired in plan 02)
 *
 * Endpoints:
 *   GET /public/papers?arxiv_ids[]=...          (batch, all formats except bibtex)
 *   GET /public/papers/{arxiv_id}?format=bibtex (single bibtex)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

// Replicate base URL resolution from client.ts so we can build URLs manually
// for the batch case (repeated arxiv_ids[] params, not supported by flat
// Record<string,string> params in client.get).
const _baseUrl =
  process.env.SF_API_BASE_URL ?? "https://api.scholarfeed.org/api/v1";
const _apiKey = process.env.SF_API_KEY ?? null;

async function batchFetch(arxivIds: string[]): Promise<unknown> {
  // Build URL with repeated ?arxiv_ids[]=A&arxiv_ids[]=B params
  const qs = new URLSearchParams();
  for (const id of arxivIds) {
    qs.append("arxiv_ids[]", id);
  }
  const url = `${_baseUrl}/public/papers?${qs.toString()}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (_apiKey) headers["Authorization"] = `Bearer ${_apiKey}`;

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`API request failed (HTTP ${response.status})`);
  }
  return response.json();
}

export function register(server: McpServer): void {
  server.registerTool(
    "get_paper",
    {
      description:
        "Get full details for one or more papers by arXiv ID. Pass a single-element array for one paper; pass multiple IDs to batch-fetch up to 50 papers in one call (replaces the removed batch_lookup tool). Pass format='bibtex' to get a .bib citation entry (replaces the removed export_bibtex tool — bibtex is single-paper only; for multi-paper bibtex, call repeatedly). Default returns a lean 12-field shape (arxiv_id, title, authors, year, categories, has_code, github_url, citation_count, venue_name, llm_summary, llm_significance, llm_novelty_score). Pass verbose=true for the full 28-field shape with structured extraction (method_name, contribution_type, task_category, datasets, baselines) and institution_tags. Use fields='abstract' to include the abstract, or fetch_fulltext with sections='all' for the full paper.",
      inputSchema: {
        arxiv_ids: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            "One or more arXiv IDs. Single-paper lookup uses [id]; batch lookup passes multiple IDs (max 50). Replaces the removed batch_lookup tool. Example: ['2407.15831'] or ['2407.15831', '2402.09906']."
          ),
        format: z
          .enum(["json", "bibtex"])
          .optional()
          .describe(
            "Response format. 'json' (default) returns structured paper data. 'bibtex' returns a .bib citation entry — replaces the removed export_bibtex tool. Bibtex mode uses the first ID in arxiv_ids."
          ),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary,abstract'). If omitted, returns the lean 12-field default unless verbose=true."
          ),
        verbose: z
          .boolean()
          .optional()
          .describe(
            "If true, returns the full 28-field paper shape (method/task/dataset extraction, application_domain, baselines, etc.). Default false returns the lean 12-field set. Ignored when `fields` is provided."
          ),
        include_results: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Include inline benchmark results from paper_results. Default true. Set false if you only need metadata."
          ),
      },
    },
    async ({ arxiv_ids, format, fields, verbose, include_results }) => {
      try {
        // bibtex mode: single-paper, use GET /papers/{id}?format=bibtex
        if (format === "bibtex") {
          const id = arxiv_ids[0];
          const params: Record<string, string> = { format: "bibtex" };
          const result = await client.get<{ bibtex: string; count: number; not_found: string[] }>(
            `/public/papers/${encodeURIComponent(id)}`,
            params
          );
          // Return the bibtex string directly (the backend wraps it in {bibtex, count, not_found})
          const bibText = result.bibtex ?? JSON.stringify(result, null, 2);
          return {
            content: [{ type: "text" as const, text: bibText }],
          };
        }

        // JSON mode (batch or single via collection route)
        const result = await batchFetch(arxiv_ids);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
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
