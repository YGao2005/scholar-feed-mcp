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
import { fencedWithNextSteps } from "./_affordances.js";
import { asStructuredObject, papersOutput } from "./_output.js";

export function register(server: McpServer): void {
  server.registerTool(
    "search_papers",
    {
      title: "Search Papers",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: papersOutput,
      description:
        "Search Scholar Feed's 600k+ CS/AI/ML paper corpus. Defaults to semantic (embedding) search — finds conceptually related papers even when the user's wording doesn't match the paper's title/abstract. Pass mode='keyword' for exact-string full-text search. CAVEAT: semantic search often misses old high-citation CANONICAL papers (e.g. foundational anchors like H2O for KV eviction, GRIT for unified embedding+generation) because the ranker prefers recent stylistically-matched papers. If you're hunting the canonical anchor for an area, parse the top-5 result abstracts for baseline mentions ('we compare against X, Y, Z'), then look the most-mentioned name up directly. Returns papers with LLM-generated summaries, novelty scores, and structured extraction data. Default response is a lean 14-field shape (arxiv_id, title, authors, year, categories, has_code, github_url, citation_count, venue_name, llm_summary, llm_significance, llm_novelty_score, impact_pct, impact_tier) — pass verbose=true or fields=... for the full shape with method/task/dataset extraction. RANKING BY IMPACT — two different notions, don't confuse them: (1) PROVEN impact = citations. For 'the important/seminal papers on topic X', pass sort='impactful' (most-cited among the relevant) or sort='balanced' (relevant AND well-cited). This is the right tool for established/foundational work. (2) FORECAST impact = impact_pct (0-100), an ML per-category percentile of PREDICTED citations, only computed for the last ~90 days; impact_tier is its A+/A/B/C/D grade. For 'what's rising/new in X' pass sort='trending' or filter impact_min=N — but NOTE impact_pct is NULL on everything older than ~90 days, so impact_min DROPS all established/canonical papers (it is NOT a way to find the influential papers in a niche — use sort='impactful' for that). Both impact notions are distinct from llm_novelty_score (new-idea-ness, an orthogonal filter). (3) ADOPTION impact = GitHub traction. Pass sort='community' to rank by real-world engineering adoption (stars + star-velocity) — the papers practitioners are actually running/building on, independent of citations or recency. Filter on it with min_stars=N (minimum GitHub stars) and has_code=true (only papers with a code release); has_code/min_stars surface RUNNABLE/ADOPTED work, the engineering counterpart to citations. github_url_exists=true is the stricter has_code (requires a linked repo). Supports filtering by category, novelty, recency, method, task, dataset, and contribution type — plus min_citations (minimum PROVEN citations, keeps established papers unlike the ~90-day impact_min) and an explicit date window via published_after / published_before ('YYYY-MM-DD', vs days' rolling lookback). v3 ABSORPTIONS: pass sort='trending' to rank by rising/forecast impact (impact_pct); pass anchor_paper_id to replicate find_similar (q is ignored in anchor mode, results carry similarity_score); pass scope_to_citations_of to restrict search to a paper's citation graph (replaces find_citations_about).",
      inputSchema: {
        q: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Search query keywords. Optional when anchor_paper_id is set (anchor mode ignores q and returns papers similar to the anchor).",
          ),
        sort: z
          .enum([
            "relevance",
            "balanced",
            "impactful",
            "trending",
            "recent",
            "community",
          ])
          .optional()
          .describe(
            "Result ranking — a relevance↔impact dial plus time-based and adoption orders. 'relevance' (default) = best topical match. 'balanced' = relevant AND well-cited. 'impactful' = the most-cited (proven-influential) papers among those relevant to the query — use this for 'the important/seminal papers on topic X'. 'trending' = rising/FORECAST impact (impact_pct, last ~90 days) — use for 'what's hot/new in X', NOT for established work. 'recent' = newest first. 'community' = GitHub adoption (stars + star-velocity) — surfaces the papers practitioners are actually running/building on, regardless of citations or recency. Proven impact ('impactful'/'balanced') ranks by real citations; 'trending' is a model prediction; 'community' is real-world engineering traction. Pair with get_foundational_lineage for a topic's canonical roots.",
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
        impact_min: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe(
            "Minimum impact_pct (0-100), e.g. 80 = top 20% FORECAST impact. This is a RISING-WORK filter: impact_pct is only computed for the last ~90 days, so impact_min restricts results to recent papers predicted to land well AND DROPS everything older. Use it for 'what's rising in X'. Do NOT use it to find the influential/seminal papers in a topic — that excludes the established work; use sort='impactful' instead.",
          ),
        days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Limit to papers published within N days"),
        has_code: z
          .boolean()
          .optional()
          .describe(
            "Filter to papers with a linked code release (has_code=true). Surfaces runnable/reproducible work — pair with min_stars/sort='community' to find the papers practitioners actually adopt.",
          ),
        min_citations: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Minimum real citation count. Unlike impact_min (a ~90-day FORECAST percentile), this filters on PROVEN citations and keeps established/canonical papers.",
          ),
        min_stars: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Minimum GitHub stars on the paper's linked repo. A proxy for engineering adoption — surfaces work that practitioners are actually running/building on. Pair with sort='community' to rank by it.",
          ),
        github_url_exists: z
          .boolean()
          .optional()
          .describe(
            "Filter on whether the paper has a linked GitHub URL (true = only papers with a repo). Stricter than has_code (which counts any code link).",
          ),
        published_after: z
          .string()
          .optional()
          .describe(
            "Only papers published on or after this date, 'YYYY-MM-DD'. Use with published_before to bound an arbitrary date window (days only gives a rolling N-day lookback).",
          ),
        published_before: z
          .string()
          .optional()
          .describe(
            "Only papers published on or before this date, 'YYYY-MM-DD'. Pair with published_after for an explicit window.",
          ),
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
      impact_min,
      days,
      has_code,
      min_citations,
      min_stars,
      github_url_exists,
      published_after,
      published_before,
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
        if (impact_min !== undefined) params.impact_min = String(impact_min);
        if (days !== undefined) params.days = String(days);
        if (has_code !== undefined) params.has_code = String(has_code);
        if (min_citations !== undefined)
          params.min_citations = String(min_citations);
        if (min_stars !== undefined) params.min_stars = String(min_stars);
        if (github_url_exists !== undefined)
          params.github_url_exists = String(github_url_exists);
        if (published_after !== undefined)
          params.published_after = published_after;
        if (published_before !== undefined)
          params.published_before = published_before;
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
              text: fencedWithNextSteps(result, "search"),
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
