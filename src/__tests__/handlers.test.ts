/**
 * Tool-handler tests — register the real tools on a fake server, invoke the
 * captured handlers with a mocked fetch, and assert the outgoing request.
 * These cover the high-branch tools and guard the v3.0.2 param removals.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerAllTools } from "../tools/index.js";
import {
  makeFakeServer,
  stubFetch,
  type ToolHandler,
  type CapturedRequest,
} from "./helpers.js";

const TEST_BASE = "https://example.test/api/v1";
const ENV_KEYS = ["SF_API_KEY", "SF_API_BASE_URL", "SF_API_TIMEOUT_MS"];

function buildTools(): Map<
  string,
  { inputSchema: Record<string, unknown>; handler: ToolHandler }
> {
  const { server, tools } = makeFakeServer();
  registerAllTools(server);
  const map = new Map<
    string,
    { inputSchema: Record<string, unknown>; handler: ToolHandler }
  >();
  for (const [name, def] of tools) {
    map.set(name, { inputSchema: def.inputSchema, handler: def.handler });
  }
  return map;
}

const TOOLS = buildTools();

function handlerFor(name: string): ToolHandler {
  const t = TOOLS.get(name);
  if (!t) throw new Error(`tool not registered: ${name}`);
  return t.handler;
}

function schemaFor(name: string): Record<string, unknown> {
  const t = TOOLS.get(name);
  if (!t) throw new Error(`tool not registered: ${name}`);
  return t.inputSchema;
}

/** Invoke a handler with a stubbed fetch + clean env; return captured requests + result. */
async function invoke(
  name: string,
  args: Record<string, unknown>,
  opts?: Parameters<typeof stubFetch>[0],
): Promise<{
  calls: CapturedRequest[];
  url: URL | undefined;
  result: Awaited<ReturnType<ToolHandler>>;
}> {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    snap[k] = process.env[k];
    delete process.env[k];
  }
  process.env.SF_API_BASE_URL = TEST_BASE;
  const f = stubFetch(opts);
  try {
    const result = await handlerFor(name)(args);
    const url = f.calls.length > 0 ? new URL(f.calls[0].url) : undefined;
    return { calls: f.calls, url, result };
  } finally {
    f.restore();
    for (const k of ENV_KEYS) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("search_papers handler", () => {
  it("defaults mode to semantic", async () => {
    const { url } = await invoke("search_papers", {
      q: "test",
      page: 1,
      limit: 20,
    });
    assert.ok(url);
    assert.ok(url.pathname.endsWith("/public/papers/search"));
    assert.strictEqual(url.searchParams.get("mode"), "semantic");
    assert.strictEqual(url.searchParams.get("q"), "test");
  });

  it("passes sort=trending through", async () => {
    const { url } = await invoke("search_papers", {
      q: "x",
      sort: "trending",
      page: 1,
      limit: 20,
    });
    assert.strictEqual(url?.searchParams.get("sort"), "trending");
  });

  it("anchor mode forwards anchor_paper_id", async () => {
    const { url } = await invoke("search_papers", {
      anchor_paper_id: "2407.15831",
      page: 1,
      limit: 20,
    });
    assert.strictEqual(url?.searchParams.get("anchor_paper_id"), "2407.15831");
  });

  it("no longer exposes has_results in its schema", () => {
    assert.ok(!("has_results" in schemaFor("search_papers")));
  });
});

describe("get_paper handler", () => {
  it("batch fetch uses repeated arxiv_ids[] and never sends include_results", async () => {
    const { url } = await invoke("get_paper", { arxiv_ids: ["A", "B"] });
    assert.ok(url);
    assert.ok(url.pathname.endsWith("/public/papers"));
    assert.deepStrictEqual(url.searchParams.getAll("arxiv_ids[]"), ["A", "B"]);
    assert.strictEqual(url.searchParams.has("include_results"), false);
  });

  it("forwards verbose and fields (previously inert)", async () => {
    const verbose = await invoke("get_paper", {
      arxiv_ids: ["A"],
      verbose: true,
    });
    assert.strictEqual(verbose.url?.searchParams.get("verbose"), "true");

    const fields = await invoke("get_paper", {
      arxiv_ids: ["A"],
      fields: "arxiv_id,title",
    });
    assert.strictEqual(
      fields.url?.searchParams.get("fields"),
      "arxiv_id,title",
    );
  });

  it("bibtex mode hits the single-paper route and returns the bib string", async () => {
    const { url, result } = await invoke(
      "get_paper",
      { arxiv_ids: ["A", "B"], format: "bibtex" },
      { json: { bibtex: "@article{x}", count: 1, not_found: [] } },
    );
    assert.ok(url?.pathname.endsWith("/public/papers/A"));
    assert.strictEqual(url?.searchParams.get("format"), "bibtex");
    assert.strictEqual(result.content[0].text, "@article{x}");
  });

  it("schema drops include_results but keeps fields and verbose", () => {
    const schema = schemaFor("get_paper");
    assert.ok(!("include_results" in schema));
    assert.ok("verbose" in schema);
    assert.ok("fields" in schema);
  });
});

describe("find_author handler", () => {
  it("rejects when neither q nor id is provided", async () => {
    const { result } = await invoke("find_author", {});
    assert.strictEqual(result.isError, true);
  });

  it("rejects when both q and id are provided", async () => {
    const { result } = await invoke("find_author", { q: "x", id: 5 });
    assert.strictEqual(result.isError, true);
  });

  it("q-mode hits /authors/discover", async () => {
    const { url } = await invoke("find_author", {
      q: "efficient transformers",
      limit: 20,
    });
    assert.ok(url?.pathname.endsWith("/public/authors/discover"));
    assert.strictEqual(url?.searchParams.get("q"), "efficient transformers");
  });

  it("id-mode hits /authors/{id}", async () => {
    const { url } = await invoke("find_author", { id: 42 });
    assert.ok(url?.pathname.endsWith("/public/authors/42"));
  });
});
