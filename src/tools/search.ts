/**
 * search_papers tool — full-text search across Scholar Feed's 600k+ paper corpus.
 *
 * v3: absorbs find_similar (anchor_paper_id), find_citations_about
 * (scope_to_citations_of), and whats_trending (sort='trending') in addition
 * to the original search-by-query behaviour.
 *
 * Endpoint: GET /public/papers/search
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencePaperContent } from "./_untrusted.js";

export function register(server: McpServer): void {
  server.registerTool(
    "search_papers",
    {
      description:
        "Search Scholar Feed's 600k+ CS/AI/ML paper corpus. Defaults to semantic (embedding) search — finds conceptually related papers even when the user's wording doesn't match the paper's title/abstract. Pass mode='keyword' for exact-string full-text search. CAVEAT: semantic search often misses old high-citation CANONICAL papers (e.g. foundational anchors like H2O for KV eviction, GRIT for unified embedding+generation) because the ranker prefers recent stylistically-matched papers. If you're hunting the canonical anchor for an area, parse the top-5 result abstracts for baseline mentions ('we compare against X, Y, Z'), then look the most-mentioned name up directly. Returns papers with LLM-generated summaries, novelty scores, and structured extraction data. Default response is a lean 12-field shape (arxiv_id, title, authors, year, categories, has_code, github_url, citation_count, venue_name, llm_summary, llm_significance, llm_novelty_score) — pass verbose=true or fields=... for the full 28-field shape with method/task/dataset extraction. Supports filtering by category, novelty, recency, method, task, dataset, and contribution type. v3 ABSORPTIONS: pass sort='trending' to replicate whats_trending; pass anchor_paper_id to replicate find_similar (q is ignored in anchor mode, results carry similarity_score); pass scope_to_citations_of to restrict search to a paper's citation graph (replaces find_citations_about).",
      inputSchema: {
        q: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Search query keywords. Optional when anchor_paper_id is set (anchor mode ignores q and returns papers similar to the anchor).",
          ),
        sort: z
          .enum(["relevance", "trending", "recent"])
          .optional()
          .describe(
            "Sort order. 'relevance' (default) ranks by semantic/keyword match. 'trending' ranks by daily quality+recency score — replaces the removed whats_trending tool. 'recent' returns newest papers first.",
          ),
        anchor_paper_id: z
          .string()
          .optional()
          .describe(
            "Return papers similar to this arXiv paper ID (replaces the removed find_similar tool). When set, q is ignored and results carry similarity_score. Example: '2407.15831'.",
          ),
        scope_to_citations_of: z
          .string()
          .optional()
          .describe(
            "Restrict search to this paper's citation graph, ranked by relevance to q (replaces the removed find_citations_about tool). Pass the arXiv ID of the paper whose citations you want to search within.",
          ),
        category: z
          .string()
          .optional()
          .describe("Filter by arXiv category e.g. 'cs.AI', 'cs.LG'"),
        novelty_min: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Minimum novelty score (0-1). Use 0.5+ for novel papers."),
        days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Limit to papers published within N days"),
        method_category: z
          .string()
          .optional()
          .describe(
            "Filter by method category e.g. 'reinforcement learning', 'transformer'",
          ),
        method_name: z
          .string()
          .optional()
          .describe(
            "Filter to papers introducing/using a specific named method e.g. 'LoRA', 'YOLO', 'DPO'. Case-insensitive substring match on the extracted method_name field.",
          ),
        task: z
          .string()
          .optional()
          .describe(
            "Filter by task e.g. 'image classification', 'question answering' (partial match)",
          ),
        dataset: z
          .string()
          .optional()
          .describe(
            "Filter to papers that evaluate on a specific dataset e.g. 'MMLU', 'ImageNet'",
          ),
        contribution_type: z
          .enum([
            "model",
            "method",
            "benchmark",
            "dataset",
            "survey",
            "theoretical",
            "empirical_study",
            "system",
          ])
          .optional()
          .describe("Filter by paper's contribution type"),
        task_category: z
          .enum([
            "NLP",
            "Computer Vision",
            "RL",
            "Audio/Speech",
            "Graphs",
            "Multimodal",
            "Systems",
            "Theory",
            "Security",
            "Other",
          ])
          .optional()
          .describe("Filter by broad research area"),
        mode: z
          .enum(["keyword", "semantic"])
          .optional()
          .describe(
            "Search mode. 'semantic' (default) uses embedding similarity — finds conceptually related papers even without exact keyword matches. 'keyword' uses Postgres full-text search — faster but only matches exact terms.",
          ),
        cursor: z
          .string()
          .optional()
          .describe(
            "Cursor from previous response's next_cursor for keyset pagination",
          ),
        page: z.coerce.number().int().min(1).default(1).describe("Page number"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Results per page (max 50)"),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of fields to return (e.g. 'arxiv_id,title,llm_summary,llm_novelty_score'). If omitted, returns the lean 12-field default unless verbose=true.",
          ),
        verbose: z
          .boolean()
          .optional()
          .describe(
            "If true, returns the full 28-field paper shape (method/task/dataset extraction, application_domain, baselines, etc.). Default false returns the lean 12-field set. Ignored when `fields` is provided.",
          ),
        exclude_ids: z
          .array(z.string())
          .optional()
          .describe(
            "arXiv IDs to exclude from results (for deduplication across chained calls)",
          ),
      },
    },
    async ({
      q,
      sort,
      anchor_paper_id,
      scope_to_citations_of,
      category,
      novelty_min,
      days,
      method_category,
      method_name,
      task,
      dataset,
      contribution_type,
      task_category,
      mode,
      cursor,
      page,
      limit,
      fields,
      verbose,
      exclude_ids,
    }) => {
      try {
        const params: Record<string, string> = {};
        if (q !== undefined) params.q = q;
        if (sort !== undefined) params.sort = sort;
        if (anchor_paper_id !== undefined)
          params.anchor_paper_id = anchor_paper_id;
        if (scope_to_citations_of !== undefined)
          params.scope_to_citations_of = scope_to_citations_of;
        if (category !== undefined) params.category = category;
        if (novelty_min !== undefined) params.novelty_min = String(novelty_min);
        if (days !== undefined) params.days = String(days);
        if (method_category !== undefined)
          params.method_category = method_category;
        if (method_name !== undefined) params.method_name = method_name;
        if (task !== undefined) params.task = task;
        if (dataset !== undefined) params.dataset = dataset;
        if (contribution_type !== undefined)
          params.contribution_type = contribution_type;
        if (task_category !== undefined) params.task_category = task_category;
        // Default to semantic search — keyword sorts by rank_score (not relevance),
        // which is wrong for natural-language queries (audit 2026-05-14).
        params.mode = mode ?? "semantic";
        if (cursor !== undefined) params.cursor = cursor;
        params.page = String(page);
        params.limit = String(limit);
        if (fields !== undefined) params.fields = fields;
        if (verbose === true) params.verbose = "true";
        if (exclude_ids !== undefined && exclude_ids.length > 0)
          params.exclude_ids = exclude_ids.join(",");

        const result = await client.get<unknown>(
          "/public/papers/search",
          params,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: fencePaperContent(result),
            },
          ],
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
