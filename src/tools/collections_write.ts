/**
 * Collection write/read tools — list_collections, create_collection,
 * add_to_collection, remove_from_collection.
 *
 * These MUTATE the authenticated user's collections (named groups of saved
 * papers) and require an SF_API_KEY. Adding a paper to a collection also
 * auto-saves it to the library (backend INSERT-only, idempotent).
 *
 * Paper references are arXiv IDs — the backend resolves arXiv → internal id on the
 * collection add/remove path. Collections can be addressed by id OR by name
 * (get-or-create by name), so an agent never has to look up an id first.
 *
 * Nesting: storage is flat, but a "/" in a name is the folder convention —
 * "AgentOPA/Formal" is the collection "Formal" inside an "AgentOPA" folder.
 * Folders are derived from the name (no parent row to create first), and the
 * web UI renders them as a collapsible tree. list_collections surfaces the
 * derived folder/depth per collection so an agent can reason about the tree.
 *
 * Endpoints:
 *   GET    /collections                       (list, with paper counts)
 *   POST   /collections                       (create; body {name})
 *   POST   /collections/{id}/papers           (add; body {paper_id}; auto-saves)
 *   DELETE /collections/{id}/papers/{paper}   (remove; 204)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

interface Collection {
  id: string;
  name: string;
  paper_count?: number;
}

interface CollectionList {
  collections: Collection[];
}

/**
 * Annotate each collection with its derived nesting, splitting the name on "/".
 * Storage stays flat; this just exposes the folder path the "/" convention
 * implies so an agent (and the operator reading raw output) can see the tree.
 * Empty segments are dropped, so "A // B" collapses to folder "A", leaf "B".
 */
function withNesting(collections: Collection[]) {
  return collections.map((c) => {
    const segments = c.name
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      ...c,
      leaf_name: segments[segments.length - 1] ?? c.name,
      folder: segments.length > 1 ? segments.slice(0, -1).join("/") : null,
      depth: Math.max(0, segments.length - 1),
    };
  });
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

/** Find a collection by exact (case-insensitive) name, or null. */
async function findCollectionByName(name: string): Promise<Collection | null> {
  const data = await client.get<CollectionList>("/collections");
  const target = name.trim().toLowerCase();
  return (
    (data.collections || []).find((c) => c.name.toLowerCase() === target) ??
    null
  );
}

/** Resolve a collection by id or name; create it by name if missing. */
async function getOrCreateCollection(
  collection_id: string | undefined,
  collection_name: string | undefined,
): Promise<Collection> {
  if (collection_id) return { id: collection_id, name: "" };
  if (!collection_name) {
    throw new Error("Provide either collection_id or collection_name.");
  }
  const existing = await findCollectionByName(collection_name);
  if (existing) return existing;
  // Create it. The backend 409s on a duplicate name — if we lost a race, re-fetch.
  try {
    return await client.post<Collection>("/collections", {
      name: collection_name.trim(),
    });
  } catch {
    const afterRace = await findCollectionByName(collection_name);
    if (afterRace) return afterRace;
    throw new Error(
      `Could not create or find collection "${collection_name}".`,
    );
  }
}

export function register(server: McpServer): void {
  server.registerTool(
    "list_collections",
    {
      title: "List Collections",
      annotations: { readOnlyHint: true, destructiveHint: false },
      description:
        "List the authenticated user's collections (named groups of saved papers) with paper counts. Read-only. Use before add_to_collection to see existing collections. Requires SF_API_KEY.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await client.get<CollectionList>("/collections");
        return text(
          JSON.stringify(
            {
              nesting_hint:
                'A "/" in a name is a folder: "AgentOPA/G1" is collection "G1" in folder "AgentOPA". Folders are derived (not stored) — to nest, just name a collection "Parent/Child".',
              collections: withNesting(data.collections || []),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "create_collection",
    {
      title: "Create Collection",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        'Create a new named collection. MUTATES. If a collection with that name already exists, returns the existing one (get-or-create — never errors on duplicate). Use "/" to nest under a folder, e.g. "AgentOPA/Formal" — the folder is derived from the name, so there is no parent to create first. Requires SF_API_KEY.',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(100)
          .describe(
            "Name for the collection, e.g. 'KV-cache compression'. Use '/' to nest: 'AgentOPA/Formal' files it under an 'AgentOPA' folder.",
          ),
      },
    },
    async ({ name }) => {
      try {
        const existing = await findCollectionByName(name);
        if (existing) {
          return text(
            `Collection already exists: ${JSON.stringify(existing, null, 2)}`,
          );
        }
        const created = await client.post<Collection>("/collections", {
          name: name.trim(),
        });
        return text(`Created collection: ${JSON.stringify(created, null, 2)}`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "add_to_collection",
    {
      title: "Add to Collection",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        'Add a paper to a collection, addressed by collection_id OR collection_name (get-or-create by name — no need to look up an id first). Nest with "/": collection_name "AgentOPA/Formal" files the paper under an "AgentOPA" folder. MUTATES: also auto-saves the paper to the library. Idempotent (adding a paper already in the collection is a no-op). Requires SF_API_KEY.',
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID of the paper to add, e.g. '2407.15831'."),
        collection_name: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Name of the collection. Created if it doesn't exist. Use '/' to nest, e.g. 'AgentOPA/Formal'. Provide this OR collection_id.",
          ),
        collection_id: z
          .string()
          .optional()
          .describe(
            "UUID of an existing collection. Provide this OR collection_name.",
          ),
      },
    },
    async ({ arxiv_id, collection_name, collection_id }) => {
      try {
        const coll = await getOrCreateCollection(
          collection_id,
          collection_name,
        );
        await client.post(`/collections/${coll.id}/papers`, {
          paper_id: arxiv_id,
        });
        const where = coll.name ? `"${coll.name}"` : coll.id;
        return text(`Added ${arxiv_id} to collection ${where} (and saved it).`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "remove_from_collection",
    {
      title: "Remove from Collection",
      annotations: { readOnlyHint: false, destructiveHint: true },
      description:
        "Remove a paper from a collection, addressed by collection_id OR collection_name. MUTATES (the paper stays in your library; it's only removed from this collection). Idempotent. Requires SF_API_KEY.",
      inputSchema: {
        arxiv_id: z
          .string()
          .min(1)
          .describe("arXiv ID of the paper to remove from the collection."),
        collection_name: z
          .string()
          .min(1)
          .optional()
          .describe("Name of the collection. Provide this OR collection_id."),
        collection_id: z
          .string()
          .optional()
          .describe("UUID of the collection. Provide this OR collection_name."),
      },
    },
    async ({ arxiv_id, collection_name, collection_id }) => {
      try {
        let id = collection_id;
        if (!id) {
          if (!collection_name) {
            throw new Error("Provide either collection_id or collection_name.");
          }
          const existing = await findCollectionByName(collection_name);
          if (!existing) {
            return text(
              `No collection named "${collection_name}" — nothing to do.`,
            );
          }
          id = existing.id;
        }
        await client.del(
          `/collections/${id}/papers/${encodeURIComponent(arxiv_id)}`,
        );
        return text(`Removed ${arxiv_id} from the collection.`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
