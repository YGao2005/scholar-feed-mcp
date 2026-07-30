/**
 * Output-schema contract tests.
 *
 * A declared `outputSchema` is enforced on every SUCCESSFUL call in TWO places
 * that disagree about unknown keys, so this file checks BOTH:
 *
 *   1. every registered tool declares a non-empty `outputSchema`;
 *   2. SERVER-side (`server/mcp.js validateToolOutput` → `safeParseAsync`): each
 *      tool's success path returns `structuredContent` that parses. Zod STRIPS
 *      unknown keys here, so this check is lenient by construction;
 *   3. CLIENT-side (`client/index.js callTool`, and the Python SDK's
 *      `_validate_tool_result`): the PUBLISHED JSON Schema must accept the same
 *      payload. `z.object()` emits `additionalProperties: false`, which REJECTS
 *      undeclared keys the server just stripped;
 *   4. end-to-end through the real SDK client over an in-memory transport — the
 *      ground truth for 2+3 together.
 *
 * Checks 3 and 4 exist because relying on 2 alone let issue #42 ship: the
 * backend began echoing `sort` on every search response, the server-side strip
 * hid it, and every validating client failed the call.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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

/**
 * Normalize a declared outputSchema to a Zod object the way the SDK's
 * `getZodSchemaObject` does — the shapes are exported pre-wrapped as loose
 * ZodObjects, but a bare raw shape is still accepted.
 */
function asZodObject(schema: unknown): z.ZodType {
  return schema instanceof z.ZodType
    ? schema
    : z.object(schema as z.ZodRawShape);
}

/**
 * Validate structuredContent the way the SERVER does (mcp.js
 * `validateToolOutput` → safeParseAsync). NOTE this is the LENIENT of the two
 * checks: zod STRIPS unknown keys, so this alone cannot catch an undeclared
 * field. `assertClientAccepts` below covers that.
 */
function validate(name: string, sc: unknown): void {
  const tool = TOOLS.get(name);
  assert.ok(tool?.outputSchema, `${name} must declare an outputSchema`);
  const parsed = asZodObject(tool.outputSchema).safeParse(sc);
  assert.ok(
    parsed.success,
    `${name} structuredContent must satisfy its outputSchema: ${
      parsed.success ? "" : JSON.stringify(parsed.error.issues)
    }`,
  );
}

/**
 * Validate structuredContent the way a STRICT CLIENT does — against the
 * PUBLISHED JSON Schema, not the server-side zod object.
 *
 * This is the check that issue #42 needed and the server-side one cannot
 * provide: `z.object()` emits `additionalProperties: false`, so a client
 * (TS SDK `callTool`, or the Python SDK's `_validate_tool_result`) REJECTS a
 * response carrying an undeclared key even though the server happily stripped
 * it and returned success. The backend echoed `sort` on every search response
 * and every validating client broke.
 */
function assertClientAccepts(name: string, sc: Record<string, unknown>): void {
  const tool = TOOLS.get(name);
  assert.ok(tool?.outputSchema, `${name} must declare an outputSchema`);
  const js = z.toJSONSchema(asZodObject(tool.outputSchema), {
    io: "output",
    unrepresentable: "any",
  }) as {
    additionalProperties?: unknown;
    properties?: Record<string, unknown>;
  };

  if (js.additionalProperties === false) {
    const undeclared = Object.keys(sc).filter(
      (k) => !(k in (js.properties ?? {})),
    );
    assert.deepStrictEqual(
      undeclared,
      [],
      `${name} publishes additionalProperties:false and its own response carries ` +
        `undeclared key(s) [${undeclared.join(", ")}] — a validating client would ` +
        `reject this successful call (see issue #42).`,
    );
  }
}

describe("every tool declares a non-empty outputSchema", () => {
  for (const [name, def] of TOOLS) {
    it(`${name} has an outputSchema`, () => {
      assert.strictEqual(
        typeof def.outputSchema,
        "object",
        `${name} must declare an outputSchema`,
      );
      const js = z.toJSONSchema(asZodObject(def.outputSchema), {
        io: "output",
        unrepresentable: "any",
      }) as { properties?: Record<string, unknown> };
      assert.ok(
        Object.keys(js.properties ?? {}).length > 0,
        `${name} outputSchema must declare at least one field`,
      );
    });
  }
});

/**
 * The structural guard for issue #42: a tool's published output schema must not
 * forbid unknown top-level keys. The backend is a separate service that adds
 * response fields without notice; with `additionalProperties: false` each such
 * addition turns every successful call into a client-side validation error.
 * `_output.ts` wraps every shape in `looseObject()` to hold this — reverting one
 * to a bare `{...}` shape fails here.
 */
describe("published output schemas accept unknown backend keys", () => {
  for (const [name, def] of TOOLS) {
    it(`${name} does not publish additionalProperties:false`, () => {
      const js = z.toJSONSchema(asZodObject(def.outputSchema), {
        io: "output",
        unrepresentable: "any",
      }) as { additionalProperties?: unknown };
      assert.notStrictEqual(
        js.additionalProperties,
        false,
        `${name} forbids unknown top-level keys, so any new backend response ` +
          `field breaks every validating client (issue #42). Wrap the shape in ` +
          `looseObject() in _output.ts.`,
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
    args: { q: "x", page: 1, limit: 20, sort: "trending" },
    opts: {
      json: {
        papers: [PAPER],
        total: 1,
        next_cursor: null,
        mode: "semantic",
        sort: "trending",
      },
    },
  },
  {
    // Query-less browse: the backend returns an EXPLICIT `total: null` (the
    // best-effort count is skipped), not an omitted key. A non-nullable
    // `total: z.number().optional()` therefore failed output validation on every
    // browse call and surfaced as an opaque MCP -32602 rather than results. The
    // fixture above uses total: 1, which is why a number-only schema passed CI
    // while the live browse path was broken. Keep BOTH shapes covered.
    label: "search_papers query-less browse (total: null)",
    name: "search_papers",
    args: { page: 1, limit: 20, sort: "trending" },
    opts: {
      json: {
        papers: [PAPER],
        total: null,
        next_cursor: null,
        mode: "keyword",
        sort: "trending",
        page: 1,
        limit: 20,
      },
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
    // Regression: after the 2026-06 OpenAlex identity rebuild, name search can
    // surface unresolved/unscored namesakes whose bibliometrics + scores are
    // explicit JSON null. zod .optional() rejects null, so this exact shape threw
    // "Output validation error" until the author fields became .nullable().
    label:
      "find_author q-mode with NULL bibliometrics/scores (unscored namesake)",
    name: "find_author",
    args: { q: "Friston", limit: 20 },
    opts: {
      json: {
        query: "Friston",
        search_type: "name",
        authors: [
          {
            id: 1,
            name: "K. Friston",
            h_index: 261,
            total_papers: 900,
            primary_field: "q-bio.NC",
            author_rank_score: 0.7,
          },
          {
            id: 2,
            name: "K. Friston",
            h_index: null,
            total_papers: null,
            primary_field: null,
            author_rank_score: null,
            years_active: null,
          },
        ],
        total: 2,
      },
    },
  },
  {
    label: "find_author id-mode, unscored author (NULL bibliometrics/rank)",
    name: "find_author",
    args: { id: 99 },
    opts: {
      json: {
        id: 99,
        name: "Sparse Author",
        h_index: null,
        total_papers: null,
        total_citations: null,
        primary_field: null,
        rank: null,
        top_papers: [],
      },
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
      assertClientAccepts(
        name,
        result.structuredContent as Record<string, unknown>,
      );
    });
  }
});

/**
 * The end-to-end guard: drive a real McpServer with the real Client over an
 * in-memory transport, so BOTH the server-side zod parse and the client-side
 * JSON Schema validation run exactly as they do in production.
 *
 * This is the test that reproduces issue #42 directly. With `search_papers`
 * registered under a schema that forbids unknown keys, `callTool` throws
 * "Structured content does not match the tool's output schema" even though the
 * search succeeded and the server returned valid data.
 */
describe("a real SDK client accepts the search_papers response", () => {
  /** Register one tool with the given schema + payload; return callTool's outcome. */
  async function roundTrip(
    outputSchema: unknown,
    structuredContent: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string; additionalProperties?: unknown }> {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    server.registerTool(
      "probe",
      {
        description: "probe",
        inputSchema: {},
        outputSchema: outputSchema as never,
      },
      async () => ({
        content: [{ type: "text" as const, text: "ok" }],
        structuredContent,
      }),
    );
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const listed = (await client.listTools()) as {
      tools: Array<{ outputSchema?: { additionalProperties?: unknown } }>;
    };
    const additionalProperties =
      listed.tools[0]?.outputSchema?.additionalProperties;
    try {
      await client.callTool({ name: "probe", arguments: {} });
      return { ok: true, additionalProperties };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        additionalProperties,
      };
    } finally {
      await client.close();
      await server.close();
    }
  }

  // The exact shape the live backend returns — `sort` is echoed on EVERY search
  // response, including when no sort argument was passed.
  const SEARCH_RESPONSE = {
    papers: [PAPER],
    total: 1,
    page: 1,
    limit: 20,
    mode: "semantic",
    sort: "trending",
    next_cursor: null,
  };

  it("passes with the shipped papersOutput schema", async () => {
    const { ok, error, additionalProperties } = await roundTrip(
      TOOLS.get("search_papers")?.outputSchema,
      SEARCH_RESPONSE,
    );
    assert.notStrictEqual(
      additionalProperties,
      false,
      "papersOutput must not publish additionalProperties:false",
    );
    assert.ok(ok, `real SDK client rejected a valid search response: ${error}`);
  });

  it("reproduces #42 when the envelope forbids unknown keys", async () => {
    // Same payload, but a strict envelope that omits `sort` — i.e. the pre-fix
    // schema. This asserts the failure mode is real, so the guard above cannot
    // pass for the wrong reason.
    const strict = {
      papers: z.array(z.unknown()).optional(),
      total: z.number().optional(),
      page: z.number().optional(),
      limit: z.number().optional(),
      mode: z.string().optional(),
      next_cursor: z.string().nullable().optional(),
    };
    const { ok, error, additionalProperties } = await roundTrip(
      strict,
      SEARCH_RESPONSE,
    );
    assert.strictEqual(additionalProperties, false);
    assert.strictEqual(ok, false);
    assert.match(String(error), /does not match the tool's output schema/);
  });
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
