/**
 * Watch tools — create_watch, preview_watch, update_watch, list_watches,
 * check_watches, delete_watch.
 *
 * A watch is a persisted search_papers query, evaluated daily server-side against
 * newly-indexed papers, whose new matches surface via the email digest and via the
 * in-session check_watches pull. Watches are account-bound and require an SF_API_KEY.
 *
 * Seed model (mirrors search_papers): a watch has exactly ONE primary selector —
 *   q | collection_name | collection_id | anchor_paper_id |
 *   scope_to_citations_of | author_id | category
 * plus a novelty_min floor (default 0.5). The seed is passed THROUGH to the backend;
 * the backend resolves collection_name → collection_id and replays the query in its
 * daily eval job (see docs/watches-backend-spec.md §3).
 *
 * Idempotency:
 *   create_watch — get-or-create by name (backend returns the existing watch on a
 *     duplicate name; never errors on duplicate, like create_collection).
 *   check_watches / list_watches — read-only. check_watches does NOT advance any
 *     watermark (only digest delivery does), so it is safe to call repeatedly.
 *   delete_watch — idempotent; deleting a missing watch is a no-op.
 *
 * v2 (docs/watch-v2-structured-spec.md): a watch can instead be a STRUCTURED filter
 * (seed.kind="filter", seed.criteria={collections|authors|categories|text|has_code|
 * min_novelty|similar}, AND-composed) — the composable, agent-tunable form. preview_watch
 * dry-runs a criteria spec; update_watch retargets a watch in place.
 *
 * Endpoints:
 *   POST   /watches          (create; body {name, novelty_min, seed:{...}})
 *   GET    /watches          (list, with pending_hits counts)
 *   GET    /watches/hits     (read-only pull; optional ?watch_id= & ?limit=)
 *   POST   /watches/preview  (read-only dry-run of a v2 criteria spec)
 *   PATCH  /watches/{id}     (partial update: name / novelty_min / criteria)
 *   DELETE /watches/{id}     (remove; 204; idempotent)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";
import { fencePaperContent } from "./_untrusted.js";
import {
  asStructuredObject,
  papersOutput,
  previewWatchOutput,
  statusContent,
  statusOutput,
  watchesListOutput,
} from "./_output.js";

interface Watch {
  id: string;
  name: string;
  novelty_min?: number;
  summary?: string;
  last_evaluated_at?: string | null;
  pending_hits?: number;
}

interface WatchList {
  watches: Watch[];
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

/** Find a watch by exact (case-insensitive) name, or null. */
async function findWatchByName(name: string): Promise<Watch | null> {
  const data = await client.get<WatchList>("/watches");
  const target = name.trim().toLowerCase();
  return (
    (data.watches || []).find((w) => w.name.toLowerCase() === target) ?? null
  );
}

/**
 * Build the seed object the backend stores. Exactly one selector must be set;
 * the backend resolves collection_name → collection_id and replays the query.
 * Returns null if not exactly one selector was provided (handler turns that into
 * a clean error).
 */
function buildSeed(args: {
  q?: string;
  collection_name?: string;
  collection_id?: string;
  anchor_paper_id?: string;
  scope_to_citations_of?: string;
  author_id?: string;
  category?: string;
}): Record<string, unknown> | null {
  const selectors: Array<[string, string, unknown]> = [
    ["topic", "q", args.q],
    ["collection", "collection_name", args.collection_name],
    ["collection", "collection_id", args.collection_id],
    ["anchor", "anchor_paper_id", args.anchor_paper_id],
    ["citations_of", "scope_to_citations_of", args.scope_to_citations_of],
    ["author", "author_id", args.author_id],
    ["category", "category", args.category],
  ];
  const set = selectors.filter(([, , v]) => v !== undefined);
  if (set.length !== 1) return null;
  const [kind, key, value] = set[0];
  return { kind, [key]: value };
}

/**
 * v2 structured filter — the composable, agent-tunable watch definition. Passed
 * THROUGH to the backend, which validates it (api/watch_filter.py) and returns a
 * clean {error, message} on anything invalid. A paper must satisfy ALL provided
 * groups (AND). See docs/watch-v2-structured-spec.md.
 */
const filterCriteria = z
  .object({
    collections: z
      .object({
        ids: z.array(z.string()).describe("Collection UUIDs."),
        relation: z
          .enum(["similar", "cites", "by_authors"])
          .default("similar")
          .describe(
            "How a new paper relates to the collection(s): 'similar' = semantic neighborhood (broad); 'cites' = the new paper cites a collection member (uses a 30-day window); 'by_authors' = shares an author with the collection. NOTE: 'similar' here uses the default 0.70 cosine floor — to tighten it, ALSO pass a top-level `similar` predicate targeting the same collection (e.g. similar:{to:'collection:<that uuid>', min_score:0.9}); the collections group has no floor of its own.",
          ),
      })
      .optional()
      .describe("Watch papers related to one or more of your collections."),
    authors: z
      .object({
        names: z.array(z.string()).optional().describe("Author display names."),
        ids: z.array(z.string()).optional().describe("Author UUIDs."),
      })
      .optional()
      .describe("Match papers by these authors."),
    categories: z
      .array(z.string())
      .optional()
      .describe("arXiv categories, e.g. ['cs.SE','cs.AI']."),
    text: z
      .object({
        query: z
          .string()
          .describe("Keyword/phrase (or a regex when mode='regex')."),
        field: z.enum(["title", "abstract", "title_abstract"]).optional(),
        mode: z.enum(["fulltext", "regex"]).optional(),
      })
      .optional()
      .describe("Keyword (full-text) or regex match on title/abstract."),
    has_code: z
      .boolean()
      .optional()
      .describe("Only papers with released code."),
    min_novelty: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Novelty floor (0..1)."),
    similar: z
      .object({
        to: z
          .string()
          .describe(
            'Target: "collection:<uuid>" | "paper:<arxivId>" | "text:<phrase>".',
          ),
        min_score: z
          .number()
          .optional()
          .describe("Cosine floor (default 0.70)."),
      })
      .optional()
      .describe(
        "Rank by semantic similarity to a target, with an optional cosine floor. Target the SAME collection used in `collections` (to:'collection:<uuid>') to put a floor on a collection-neighborhood watch.",
      ),
    rank: z
      .enum(["rising", "novelty", "recent", "relevance"])
      .optional()
      .describe(
        "How to order matches. 'rising' (default) ranks by forecasted breakout impact first (the impact_pct momentum model), falling back to novelty when a paper is not impact-scored yet; 'novelty' ranks most-novel first; 'recent' ranks newest first; 'relevance' ranks by closeness to a similar target (needs a similar target, else behaves as rising). For a creator or stay-current watch, leave it as rising.",
      ),
    min_impact_pct: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "Momentum floor: only surface papers in the top of forecasted citation impact within their field (e.g. 80 means roughly the top 20 percent). Only recently-scored papers have an impact percentile, so this also implies recent papers only — exactly right for a what-is-rising-now watch.",
      ),
  })
  .describe(
    "Structured filter — combine any of these; a paper must satisfy ALL provided groups (AND). At least one group is required.",
  );

export function register(server: McpServer): void {
  server.registerTool(
    "create_watch",
    {
      title: "Create Watch",
      annotations: { readOnlyHint: false, destructiveHint: false },
      outputSchema: statusOutput,
      description:
        "Create a standing watch — evaluated daily against newly-indexed papers, surfacing new matches via the email digest and via check_watches. MUTATES. Get-or-create by name (re-creating with an existing name returns it unchanged — never errors on duplicate). TWO forms: (1) the v2 STRUCTURED filter via `criteria` (collections/authors/categories/text/has_code/min_novelty/similar, AND-composed) — the composable, agent-tunable form, recommended; tune it with preview_watch first, and edit later with update_watch. Structured watches rank by 'rising' (forecasted breakout impact) by default, and tighten with min_impact_pct for an anti-noise watch that surfaces only the breakout papers in your niche. (2) a single legacy seed selector (q OR collection_name OR collection_id OR anchor_paper_id); if `criteria` is given it takes precedence. Requires SF_API_KEY.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(100)
          .describe("Label for the watch, e.g. 'novel KV-cache work'."),
        novelty_min: z
          .number()
          .min(0)
          .max(1)
          .default(0.5)
          .describe(
            "Only surface papers at/above this novelty score (0..1). The signal/noise knob — raise it for 'only tell me when it matters'. Default 0.5.",
          ),
        q: z
          .string()
          .min(1)
          .optional()
          .describe("Semantic/keyword topic seed. One seed selector only."),
        collection_name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Watch the neighborhood of a collection by name (resolved by the backend). One seed selector only.",
          ),
        collection_id: z
          .string()
          .optional()
          .describe(
            "Watch the neighborhood of a collection by UUID. One seed selector only.",
          ),
        anchor_paper_id: z
          .string()
          .optional()
          .describe(
            "Watch papers similar to this arXiv ID. One seed selector only.",
          ),
        scope_to_citations_of: z
          .string()
          .optional()
          .describe(
            "Watch new papers citing this arXiv ID. One seed selector only.",
          ),
        author_id: z
          .string()
          .optional()
          .describe(
            "Watch an author's new work, by author ID. One seed selector only.",
          ),
        category: z
          .string()
          .optional()
          .describe(
            "Watch an arXiv category (e.g. 'cs.LG'), filtered by novelty_min. One seed selector only.",
          ),
        criteria: filterCriteria
          .optional()
          .describe(
            "v2 STRUCTURED filter (collections/authors/categories/text/has_code/min_novelty/similar). When provided, this defines the watch (kind='filter') and the single-selector seeds above are IGNORED. This is the composable, agent-tunable form — call preview_watch first to tune it.",
          ),
        recency_days: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe(
            "For a structured (criteria) watch: only consider papers from the last N days (default 7; the 'cites' relation uses 30).",
          ),
      },
    },
    async ({
      name,
      novelty_min,
      q,
      collection_name,
      collection_id,
      anchor_paper_id,
      scope_to_citations_of,
      author_id,
      category,
      criteria,
      recency_days,
    }) => {
      try {
        // v2 structured filter takes precedence over the single-selector seeds.
        if (criteria) {
          const created = await client.post<Watch>("/watches", {
            name: name.trim(),
            novelty_min,
            seed: { kind: "filter", criteria, match: "all", recency_days },
          });
          return text(`Watch ready: ${JSON.stringify(created, null, 2)}`, {
            ok: true,
            action: "created",
            watch: created,
            message: `Watch ready: ${created.name ?? name.trim()}`,
          });
        }
        const seed = buildSeed({
          q,
          collection_name,
          collection_id,
          anchor_paper_id,
          scope_to_citations_of,
          author_id,
          category,
        });
        if (seed === null) {
          return errorResult(
            new Error(
              "Provide exactly one seed selector: q, collection_name, collection_id, anchor_paper_id, scope_to_citations_of, author_id, or category.",
            ),
          );
        }
        const created = await client.post<Watch>("/watches", {
          name: name.trim(),
          novelty_min,
          seed,
        });
        return text(`Watch ready: ${JSON.stringify(created, null, 2)}`, {
          ok: true,
          action: "created",
          watch: created,
          message: `Watch ready: ${created.name ?? name.trim()}`,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_watches",
    {
      title: "List Watches",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: watchesListOutput,
      description:
        "List the authenticated user's watches with name, a one-line definition summary, last_evaluated_at, and pending_hits (count of new matches since the last digest delivery). Read-only. Use before create_watch to see what's already tracked. Requires SF_API_KEY.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.get<unknown>("/watches");
        return text(
          JSON.stringify(result, null, 2),
          asStructuredObject(result),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "check_watches",
    {
      title: "Check Watches",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: papersOutput,
      description:
        "Pull new matching papers since the last digest delivery, in the same shape as search_papers results. Optionally scope to one watch by watch_name OR watch_id; omit both for all watches. Read-only and idempotent — does NOT advance any watermark (only digest delivery does), so it is safe to call repeatedly (no mark-on-read). This is the in-session 'anything new on my watches?' pull. Requires SF_API_KEY.",
      inputSchema: {
        watch_name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Scope to one watch by name. Provide this OR watch_id, or neither for all.",
          ),
        watch_id: z
          .string()
          .optional()
          .describe(
            "Scope to one watch by UUID. Provide this OR watch_name, or neither for all.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Max hits to return (max 100)."),
      },
    },
    async ({ watch_name, watch_id, limit }) => {
      try {
        let id = watch_id;
        if (!id && watch_name) {
          const existing = await findWatchByName(watch_name);
          if (!existing) {
            return text(`No watch named "${watch_name}" — nothing to check.`);
          }
          id = existing.id;
        }
        const params: Record<string, string> = { limit: String(limit) };
        if (id) params.watch_id = id;
        const result = await client.get<unknown>("/watches/hits", params);
        // matched papers = untrusted
        return text(fencePaperContent(result), asStructuredObject(result));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "delete_watch",
    {
      title: "Delete Watch",
      annotations: { readOnlyHint: false, destructiveHint: true },
      outputSchema: statusOutput,
      description:
        "Delete a watch, addressed by watch_id OR name. MUTATES. Idempotent: deleting a non-existent watch is a no-op (no error). To change a watch in place (rename / novelty_min / retarget criteria) use update_watch instead of delete-and-recreate. Requires SF_API_KEY.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .optional()
          .describe("Name of the watch to delete. Provide this OR watch_id."),
        watch_id: z
          .string()
          .optional()
          .describe("UUID of the watch to delete. Provide this OR name."),
      },
    },
    async ({ name, watch_id }) => {
      try {
        let id = watch_id;
        if (!id) {
          if (!name) {
            throw new Error("Provide either watch_id or name.");
          }
          const existing = await findWatchByName(name);
          if (!existing) {
            return text(`No watch named "${name}" — nothing to do.`);
          }
          id = existing.id;
        }
        await client.del(`/watches/${encodeURIComponent(id)}`);
        return text(`Deleted watch ${watch_id ? id : `"${name}"`}.`, {
          ok: true,
          action: "deleted",
          message: `Deleted watch ${watch_id ? id : `"${name}"`}.`,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "update_watch",
    {
      title: "Update Watch",
      annotations: { readOnlyHint: false, destructiveHint: false },
      outputSchema: statusOutput,
      description:
        "Update an existing watch in place — rename, change novelty_min, or RETARGET its structured filter `criteria`. MUTATES. Address by watch_id OR name. Changing criteria replaces the definition and clears the watch's pending hits (so stale matches don't deliver); the next daily eval repopulates. Structured watches rank by 'rising' (forecasted breakout impact) by default, and tighten with min_impact_pct for an anti-noise watch that surfaces only the breakout papers in your niche. Tune the new criteria with preview_watch first. Requires SF_API_KEY.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Find the watch by its current name. Provide this OR watch_id.",
          ),
        watch_id: z
          .string()
          .optional()
          .describe("Find the watch by UUID. Provide this OR name."),
        new_name: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe("Rename the watch."),
        novelty_min: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("New novelty floor (0..1)."),
        criteria: filterCriteria
          .optional()
          .describe(
            "Replace the watch's filter (becomes kind='filter'). Clears pending hits.",
          ),
        recency_days: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Window for the new criteria."),
      },
    },
    async ({
      name,
      watch_id,
      new_name,
      novelty_min,
      criteria,
      recency_days,
    }) => {
      try {
        let id = watch_id;
        if (!id) {
          if (!name) throw new Error("Provide either watch_id or name.");
          const existing = await findWatchByName(name);
          if (!existing)
            return text(`No watch named "${name}" — nothing to update.`);
          id = existing.id;
        }
        const body: Record<string, unknown> = {};
        if (new_name !== undefined) body.name = new_name;
        if (novelty_min !== undefined) body.novelty_min = novelty_min;
        if (criteria !== undefined)
          body.seed = { kind: "filter", criteria, match: "all", recency_days };
        if (Object.keys(body).length === 0) {
          return errorResult(
            new Error(
              "Nothing to update — provide new_name, novelty_min, and/or criteria.",
            ),
          );
        }
        const updated = await client.patch<Watch>(
          `/watches/${encodeURIComponent(id)}`,
          body,
        );
        return text(`Watch updated: ${JSON.stringify(updated, null, 2)}`, {
          ok: true,
          action: "updated",
          watch: updated,
          message: `Watch updated: ${updated.name ?? id}`,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "preview_watch",
    {
      title: "Preview Watch",
      annotations: { readOnlyHint: true, destructiveHint: false },
      outputSchema: previewWatchOutput,
      description:
        "Dry-run a structured filter over recent papers WITHOUT creating a watch — the tuning loop. Returns {window_days, needs_similarity, match_count, sample} so you can iterate (add a category, raise min_novelty, switch the collection relation) before saving with create_watch. Structured watches rank by 'rising' (forecasted breakout impact) by default, and tighten with min_impact_pct for an anti-noise watch that surfaces only the breakout papers in your niche. NOTE: for a similarity filter, match_count is capped at 200 (the cosine fetch window) and so saturates at 200 on broad/hot topics — tune by the `sample` scores and narrow with categories/min_novelty (or a higher similar floor) rather than relying on match_count alone. Read-only. Requires SF_API_KEY.",
      inputSchema: {
        criteria: filterCriteria.describe("The structured filter to test."),
        recency_days: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe(
            "Window in days (default 7; the 'cites' relation uses 30).",
          ),
      },
    },
    async ({ criteria, recency_days }) => {
      try {
        const result = await client.post<unknown>("/watches/preview", {
          criteria,
          match: "all",
          recency_days,
        });
        // sample matched papers = untrusted
        return text(fencePaperContent(result), asStructuredObject(result));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
