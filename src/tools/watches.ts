/**
 * Watch tools — create_watch, list_watches, check_watches, delete_watch.
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
 * Endpoints:
 *   POST   /watches        (create; body {name, novelty_min, seed:{...}})
 *   GET    /watches        (list, with pending_hits counts)
 *   GET    /watches/hits   (read-only pull; optional ?watch_id= & ?limit=)
 *   DELETE /watches/{id}   (remove; 204; idempotent)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

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

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
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

export function register(server: McpServer): void {
  server.registerTool(
    "create_watch",
    {
      description:
        "Create a standing watch — a saved search_papers query evaluated daily against newly-indexed papers, surfacing new matches via the email digest and via check_watches. MUTATES. Get-or-create by name (like create_collection): re-creating with an existing name returns the existing watch unchanged — never errors on duplicate. Provide exactly one seed selector (q OR collection_name OR collection_id OR anchor_paper_id OR scope_to_citations_of OR author_id OR category); the collection-neighborhood seed (collection_name + novelty_min) is the strongest. The seed is passed through to the backend, which resolves collection_name. Requires SF_API_KEY.",
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
          .describe("Watch an author's new work, by author ID. One seed selector only."),
        category: z
          .string()
          .optional()
          .describe(
            "Watch an arXiv category (e.g. 'cs.LG'), filtered by novelty_min. One seed selector only.",
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
    }) => {
      try {
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
        return text(`Watch ready: ${JSON.stringify(created, null, 2)}`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_watches",
    {
      description:
        "List the authenticated user's watches with name, a one-line definition summary, last_evaluated_at, and pending_hits (count of new matches since the last digest delivery). Read-only. Use before create_watch to see what's already tracked. Requires SF_API_KEY.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.get<unknown>("/watches");
        return text(JSON.stringify(result, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "check_watches",
    {
      description:
        "Pull new matching papers since the last digest delivery, in the same shape as search_papers results. Optionally scope to one watch by watch_name OR watch_id; omit both for all watches. Read-only and idempotent — does NOT advance any watermark (only digest delivery does), so it is safe to call repeatedly (no mark-on-read). This is the in-session 'anything new on my watches?' pull. Requires SF_API_KEY.",
      inputSchema: {
        watch_name: z
          .string()
          .min(1)
          .optional()
          .describe("Scope to one watch by name. Provide this OR watch_id, or neither for all."),
        watch_id: z
          .string()
          .optional()
          .describe("Scope to one watch by UUID. Provide this OR watch_name, or neither for all."),
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
        return text(JSON.stringify(result, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "delete_watch",
    {
      description:
        "Delete a watch, addressed by watch_id OR name. MUTATES. Idempotent: deleting a non-existent watch is a no-op (no error). Editing a watch is out of scope — delete and recreate. Requires SF_API_KEY.",
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
        return text(`Deleted watch ${watch_id ? id : `"${name}"`}.`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
