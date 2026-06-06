/**
 * Output-schema contract tests.
 *
 * Two guarantees, both aimed at the MCP SDK's `validateToolOutput`
 * (server/mcp.js), which THROWS on a successful call when a tool declares an
 * `outputSchema` but returns no `structuredContent`, or returns one that fails
 * the schema:
 *
 *   1. every registered tool declares a non-empty `outputSchema`, and
 *   2. each tool's SUCCESS path returns a `structuredContent` that validates
 *      against that schema.
 *
 * We replicate the SDK's check exactly — `z.object(outputSchema).safeParse(...)`
 * on the raw shape — so a green run here means the live server will not raise
 * "Output validation error" for these shapes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { registerAllTools } from "../tools/index.js";
import {
  makeFakeServer,
  stubFetch,
  type CapturedTool,
  type ToolResult,
} from "./helpers.js";

const TEST_BASE = "https://example.test/api/v1";
const ENV_KEYS = ["SF_API_KEY", "SF_API_BASE_URL", "SF_API_TIMEOUT_MS"];

function buildTools(): Map<string, CapturedTool> {
  const { server, tools } = makeFakeServer();
  registerAllTools(server);
  return tools;
}

const TOOLS = buildTools();

/** Run a tool handler with a stubbed fetch + clean env; return its result. */
async function invoke(
  name: string,
  args: Record<string, unknown>,
  opts?: Parameters<typeof stubFetch>[0],
): Promise<ToolResult> {
  const tool = TOOLS.get(name);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    snap[k] = process.env[k];
    delete process.env[k];
  }
  process.env.SF_API_BASE_URL = TEST_BASE;
  const f = stubFetch(opts);
  try {
    return (await tool.handler(args)) as ToolResult;
  } finally {
    f.restore();
    for (const k of ENV_KEYS) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Validate structuredContent the way the SDK does: z.object(shape).safeParse. */
function validate(name: string, sc: unknown): void {
  const tool = TOOLS.get(name);
  assert.ok(tool?.outputSchema, `${name} must declare an outputSchema`);
  const schema = z.object(tool.outputSchema as z.ZodRawShape);
  const parsed = schema.safeParse(sc);
  assert.ok(
    parsed.success,
    `${name} structuredContent must satisfy its outputSchema: ${
      parsed.success ? "" : JSON.stringify(parsed.error.issues)
    }`,
  );
}

describe("every tool declares a non-empty outputSchema", () => {
  for (const [name, def] of TOOLS) {
    it(`${name} has an outputSchema`, () => {
      assert.strictEqual(
        typeof def.outputSchema,
        "object",
        `${name} must declare an outputSchema`,
      );
      assert.ok(
        Object.keys(def.outputSchema ?? {}).length > 0,
        `${name} outputSchema must declare at least one field`,
      );
    });
  }
});

/**
 * One representative SUCCESS fixture per tool (and a few extra branches). Each
 * exercises the path that returns structuredContent; we then assert the content
 * is present and schema-valid. The JSON fixtures mirror the real API shapes.
 */
const PAPER = {
  arxiv_id: "2407.15831",
  title: "A paper",
  authors: ["A. Author"],
  year: 2024,
  github_url: null,
  venue_name: null,
  llm_novelty_score: 0.7,
};

const CASES: Array<{
  label: string;
  name: string;
  args: Record<string, unknown>;
  opts?: Parameters<typeof stubFetch>[0];
}> = [
  {
    label: "search_papers",
    name: "search_papers",
    args: { q: "x", page: 1, limit: 20 },
    opts: {
      json: { papers: [PAPER], total: 1, next_cursor: null, mode: "semantic" },
    },
  },
  {
    label: "get_paper json",
    name: "get_paper",
    args: { arxiv_ids: ["A"] },
    opts: { json: { papers: [PAPER], total: 1, not_found: [] } },
  },
  {
    label: "get_paper bibtex",
    name: "get_paper",
    args: { arxiv_ids: ["A"], format: "bibtex" },
    opts: { json: { bibtex: "@article{x}", count: 1, not_found: [] } },
  },
  {
    label: "get_citations",
    name: "get_citations",
    args: { arxiv_id: "A", direction: "cited_by", limit: 20 },
    opts: { json: { papers: [PAPER], total: 1, direction: "cited_by" } },
  },
  {
    label: "fetch_fulltext results",
    name: "fetch_fulltext",
    args: { arxiv_id: "A" },
    opts: {
      json: {
        source: "arxiv",
        arxiv_id: "A",
        results_text: "r",
        table_captions: [],
      },
    },
  },
  {
    label: "fetch_fulltext sections",
    name: "fetch_fulltext",
    args: { arxiv_id: "A", sections: "all" },
    opts: {
      json: {
        source: "arxiv",
        arxiv_id: "A",
        sections: { abstract: "a", method: null },
        table_captions: ["t1"],
      },
    },
  },
  {
    label: "find_author q-mode",
    name: "find_author",
    args: { q: "Hinton", limit: 20 },
    opts: {
      json: {
        query: "Hinton",
        search_type: "name",
        authors: [{ id: 1, name: "G. Hinton", h_index: 9 }],
        total: 1,
      },
    },
  },
  {
    label: "find_author id-mode",
    name: "find_author",
    args: { id: 42 },
    opts: {
      json: { id: 42, name: "G. Hinton", h_index: 9, top_papers: [PAPER] },
    },
  },
  {
    label: "co_author_graph",
    name: "co_author_graph",
    args: { author_ids: [1], window_years: 10 },
    opts: {
      json: {
        queried_author_ids: [1],
        window_years: 10,
        edge_count: 1,
        edges: [{ from: 1, to: 2, papers_count: 3, last_collab_year: 2024 }],
      },
    },
  },
  {
    label: "embed_text",
    name: "embed_text",
    args: { text: "x", task_type: "RETRIEVAL_DOCUMENT" },
    opts: {
      json: { embedding: [0.1, 0.2, 0.3], model: "gemini", dimensions: 768 },
    },
  },
  {
    label: "get_field_orientation",
    name: "get_field_orientation",
    args: { topic: "efficient attention", limit: 15 },
    opts: {
      json: {
        topic: "efficient attention",
        papers: [
          { arxiv_id: "A", published_date: "2024-01-01", rank_score: 1.2 },
        ],
        total: 1,
        note: "n",
      },
    },
  },
  {
    label: "get_foundational_lineage",
    name: "get_foundational_lineage",
    args: {
      anchor_paper_id: "2504.04704",
      scope: "field",
      generality_ceiling: true,
      limit: 15,
    },
    opts: {
      json: {
        anchor: "2504.04704",
        scope: "field",
        niche_size: 200,
        tiers: {
          niche_roots: [{ arxiv_id: "A", lift: 1.2, cited_by_in_niche: ["B"] }],
          field_level: [],
          discipline: [],
        },
        note: null,
      },
    },
  },
  {
    label: "save_paper",
    name: "save_paper",
    args: { arxiv_id: "A" },
    opts: { json: { success: true, action: "added", paper_id: "A" } },
  },
  {
    label: "unsave_paper",
    name: "unsave_paper",
    args: { arxiv_id: "A" },
    opts: { json: { success: true, action: "removed", paper_id: "A" } },
  },
  {
    label: "like_paper",
    name: "like_paper",
    args: { arxiv_id: "A" },
    opts: { json: { ok: true } },
  },
  {
    label: "list_library",
    name: "list_library",
    args: { limit: 10, page: 1 },
    opts: { json: { papers: [PAPER], total: 1 } },
  },
  {
    label: "list_collections",
    name: "list_collections",
    args: {},
    opts: { json: { collections: [{ id: "c1", name: "n", paper_count: 2 }] } },
  },
  {
    label: "create_collection (created)",
    name: "create_collection",
    args: { name: "new one" },
    opts: { json: { collections: [] } },
  },
  {
    label: "add_to_collection",
    name: "add_to_collection",
    args: { arxiv_id: "A", collection_id: "c1" },
    opts: { json: { ok: true } },
  },
  {
    label: "remove_from_collection",
    name: "remove_from_collection",
    args: { arxiv_id: "A", collection_id: "c1" },
    opts: { json: { ok: true } },
  },
  {
    label: "create_watch",
    name: "create_watch",
    args: { name: "w", novelty_min: 0.5, q: "x" },
    opts: { json: { id: "w1", name: "w", novelty_min: 0.5 } },
  },
  {
    label: "list_watches",
    name: "list_watches",
    args: {},
    opts: { json: { watches: [{ id: "w1", name: "n", pending_hits: 0 }] } },
  },
  {
    label: "check_watches (hits)",
    name: "check_watches",
    args: { watch_id: "w1", limit: 25 },
    opts: { json: { papers: [PAPER], total: 1 } },
  },
  {
    label: "check_watches (no watch found → text path)",
    name: "check_watches",
    args: { watch_name: "nope", limit: 50 },
    opts: { json: { watches: [] } },
  },
  {
    label: "update_watch",
    name: "update_watch",
    args: { watch_id: "w1", new_name: "r", novelty_min: 0.8 },
    opts: { json: { id: "w1", name: "r" } },
  },
  {
    label: "delete_watch",
    name: "delete_watch",
    args: { watch_id: "w1" },
    opts: { json: { ok: true } },
  },
  {
    label: "preview_watch",
    name: "preview_watch",
    args: { criteria: { categories: ["cs.SE"] }, recency_days: 7 },
    opts: {
      json: {
        window_days: 7,
        needs_similarity: false,
        match_count: 1,
        sample: [PAPER],
      },
    },
  },
  {
    label: "find_gaps",
    name: "find_gaps",
    args: { topic: "rag", scope: "both", limit: 10 },
    opts: { json: { foundational_gaps: [PAPER], frontier_gaps: [] } },
  },
  {
    label: "ask_library",
    name: "ask_library",
    args: { question: "what is the consensus?", limit: 8 },
    opts: { json: { answer: "a", citations: [], papers: [PAPER] } },
  },
];

describe("tool success paths return schema-valid structuredContent", () => {
  for (const { label, name, args, opts } of CASES) {
    it(`${label} → structuredContent satisfies its outputSchema`, async () => {
      const result = await invoke(name, args, opts);
      assert.notStrictEqual(
        result.isError,
        true,
        `${label} should be a success path, got an error: ${result.content?.[0]?.text}`,
      );
      assert.strictEqual(
        typeof result.structuredContent,
        "object",
        `${label} must return structuredContent`,
      );
      validate(name, result.structuredContent);
    });
  }
});

describe("the bundled affordance text is preserved alongside structuredContent", () => {
  it("search_papers still returns fenced text AND structuredContent", async () => {
    const result = await invoke(
      "search_papers",
      { q: "x", page: 1, limit: 20 },
      { json: { papers: [PAPER], total: 1 } },
    );
    assert.match(result.content[0].text, /BEGIN UNTRUSTED PAPER CONTENT/);
    assert.deepStrictEqual(
      (result.structuredContent as { papers?: unknown[] }).papers?.length,
      1,
    );
  });
});
