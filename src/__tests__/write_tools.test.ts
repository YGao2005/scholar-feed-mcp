/**
 * Handler tests for the tools that were only proven to EXIST (registry test) but
 * never exercised: the key-required write/Pro surface (library writes, collection
 * writes, watches incl. v2 structured + update/preview, ask_library, find_gaps,
 * embed_text) plus the remaining read-only GET tools (citations, co_author_graph,
 * field_orientation, foundational_lineage).
 *
 * For each: assert the right endpoint + method, that params/body pass through, the
 * one-seed/at-most-one validation, the toggle self-correction, and that the
 * deliberate { error, message } / pro_required envelopes surface verbatim.
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

function buildTools(): Map<string, ToolHandler> {
  const { server, tools } = makeFakeServer();
  registerAllTools(server);
  const map = new Map<string, ToolHandler>();
  for (const [name, def] of tools) map.set(name, def.handler);
  return map;
}

const TOOLS = buildTools();

function handlerFor(name: string): ToolHandler {
  const h = TOOLS.get(name);
  if (!h) throw new Error(`tool not registered: ${name}`);
  return h;
}

/** Invoke a handler with a stubbed fetch + clean env; return captured calls + result. */
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

function methodOf(req: CapturedRequest): string | undefined {
  return req.init?.method;
}

function bodyOf(req: CapturedRequest): Record<string, unknown> {
  const raw = req.init?.body;
  return raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// library.ts — save / unsave (toggle self-correction) / like / list
// ---------------------------------------------------------------------------

describe("save_paper handler", () => {
  it("POSTs the save toggle and reports Saved when action=added", async () => {
    const { calls, url, result } = await invoke(
      "save_paper",
      { arxiv_id: "2407.15831" },
      { json: { success: true, action: "added", paper_id: "2407.15831" } },
    );
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(methodOf(calls[0]), "POST");
    assert.ok(url?.pathname.endsWith("/interactions/save"));
    assert.deepStrictEqual(bodyOf(calls[0]), { paper_id: "2407.15831" });
    assert.match(result.content[0].text, /Saved to your library/);
  });

  it("self-corrects when already saved (toggle returned removed → re-saves)", async () => {
    const { calls, result } = await invoke(
      "save_paper",
      { arxiv_id: "A" },
      { json: { success: true, action: "removed", paper_id: "A" } },
    );
    assert.strictEqual(calls.length, 2); // restore call
    assert.match(result.content[0].text, /Already in your library/);
  });
});

describe("unsave_paper handler", () => {
  it("reports Removed when toggle returned removed", async () => {
    const { calls, result } = await invoke(
      "unsave_paper",
      { arxiv_id: "A" },
      { json: { success: true, action: "removed", paper_id: "A" } },
    );
    assert.strictEqual(calls.length, 1);
    assert.match(result.content[0].text, /Removed from your library/);
  });

  it("self-corrects when not saved (toggle added → undoes)", async () => {
    const { calls, result } = await invoke(
      "unsave_paper",
      { arxiv_id: "A" },
      { json: { success: true, action: "added", paper_id: "A" } },
    );
    assert.strictEqual(calls.length, 2);
    assert.match(result.content[0].text, /was not in your library/);
  });
});

describe("like_paper handler", () => {
  it("POSTs the insert-only boost signal", async () => {
    const { calls, url } = await invoke("like_paper", { arxiv_id: "A" });
    assert.strictEqual(methodOf(calls[0]), "POST");
    assert.ok(url?.pathname.endsWith("/interactions/boost"));
    assert.deepStrictEqual(bodyOf(calls[0]), { paper_id: "A" });
  });
});

describe("list_library handler", () => {
  it("GETs /library with limit and page", async () => {
    const { url } = await invoke("list_library", { limit: 10, page: 2 });
    assert.ok(url?.pathname.endsWith("/library"));
    assert.strictEqual(url?.searchParams.get("limit"), "10");
    assert.strictEqual(url?.searchParams.get("page"), "2");
  });
});

// ---------------------------------------------------------------------------
// collections_write.ts
// ---------------------------------------------------------------------------

describe("list_collections handler", () => {
  it("GETs /collections", async () => {
    const { url, calls } = await invoke("list_collections", {});
    assert.strictEqual(methodOf(calls[0]), "GET");
    assert.ok(url?.pathname.endsWith("/collections"));
  });
});

describe("create_collection handler", () => {
  it("returns the existing collection without POSTing when the name matches", async () => {
    const { calls, result } = await invoke(
      "create_collection",
      { name: "KV-cache" },
      { json: { collections: [{ id: "c1", name: "KV-cache" }] } },
    );
    // one GET (lookup) only; no POST create
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(methodOf(calls[0]), "GET");
    assert.match(result.content[0].text, /already exists/);
  });

  it("POSTs a create when no name matches", async () => {
    const { calls } = await invoke(
      "create_collection",
      { name: "new one" },
      { json: { collections: [] } }, // lookup finds nothing
    );
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(methodOf(calls[1]), "POST");
    assert.deepStrictEqual(bodyOf(calls[1]), { name: "new one" });
  });
});

describe("add_to_collection handler", () => {
  it("by collection_id skips lookup and POSTs the membership (auto-saves)", async () => {
    const { calls, url, result } = await invoke("add_to_collection", {
      arxiv_id: "2407.15831",
      collection_id: "c1",
    });
    assert.strictEqual(calls.length, 1); // no lookup needed
    assert.strictEqual(methodOf(calls[0]), "POST");
    assert.ok(url?.pathname.endsWith("/collections/c1/papers"));
    assert.deepStrictEqual(bodyOf(calls[0]), { paper_id: "2407.15831" });
    assert.match(result.content[0].text, /Added 2407\.15831/);
  });

  it("errors when neither collection_id nor collection_name given", async () => {
    const { calls, result } = await invoke("add_to_collection", {
      arxiv_id: "A",
    });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result.isError, true);
  });
});

describe("remove_from_collection handler", () => {
  it("by collection_id DELETEs the membership", async () => {
    const { calls, url } = await invoke("remove_from_collection", {
      arxiv_id: "2407.15831",
      collection_id: "c1",
    });
    assert.strictEqual(methodOf(calls[0]), "DELETE");
    assert.ok(url?.pathname.endsWith("/collections/c1/papers/2407.15831"));
  });
});

// ---------------------------------------------------------------------------
// watches.ts
// ---------------------------------------------------------------------------

describe("create_watch handler", () => {
  it("legacy q seed builds seed.kind=topic", async () => {
    const { calls, url } = await invoke("create_watch", {
      name: "kv work",
      novelty_min: 0.5,
      q: "kv cache compression",
    });
    assert.strictEqual(methodOf(calls[0]), "POST");
    assert.ok(url?.pathname.endsWith("/watches"));
    const body = bodyOf(calls[0]);
    assert.strictEqual(body.name, "kv work");
    assert.deepStrictEqual(body.seed, {
      kind: "topic",
      q: "kv cache compression",
    });
  });

  it("v2 criteria takes precedence → seed.kind=filter", async () => {
    const { calls } = await invoke("create_watch", {
      name: "structured",
      novelty_min: 0.6,
      q: "ignored when criteria present",
      criteria: { categories: ["cs.LG"], min_novelty: 0.7 },
      recency_days: 14,
    });
    const seed = bodyOf(calls[0]).seed as Record<string, unknown>;
    assert.strictEqual(seed.kind, "filter");
    assert.strictEqual(seed.match, "all");
    assert.strictEqual(seed.recency_days, 14);
  });

  it("rejects when no seed selector and no criteria", async () => {
    const { calls, result } = await invoke("create_watch", {
      name: "empty",
      novelty_min: 0.5,
    });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result.isError, true);
  });
});

describe("list_watches handler", () => {
  it("GETs /watches", async () => {
    const { url, calls } = await invoke("list_watches", {});
    assert.strictEqual(methodOf(calls[0]), "GET");
    assert.ok(url?.pathname.endsWith("/watches"));
  });
});

describe("check_watches handler", () => {
  it("by watch_id GETs /watches/hits with the id + limit", async () => {
    const { url } = await invoke("check_watches", {
      watch_id: "w1",
      limit: 25,
    });
    assert.ok(url?.pathname.endsWith("/watches/hits"));
    assert.strictEqual(url?.searchParams.get("watch_id"), "w1");
    assert.strictEqual(url?.searchParams.get("limit"), "25");
  });

  it("unknown watch_name short-circuits with no hits call", async () => {
    const { calls, result } = await invoke(
      "check_watches",
      { watch_name: "nope", limit: 50 },
      { json: { watches: [] } }, // findWatchByName resolves to null
    );
    // one GET /watches lookup only; no /watches/hits
    assert.strictEqual(calls.length, 1);
    assert.match(result.content[0].text, /No watch named/);
  });
});

describe("delete_watch handler", () => {
  it("by watch_id DELETEs the watch", async () => {
    const { calls, url } = await invoke("delete_watch", { watch_id: "w1" });
    assert.strictEqual(methodOf(calls[0]), "DELETE");
    assert.ok(url?.pathname.endsWith("/watches/w1"));
  });

  it("errors when neither watch_id nor name given", async () => {
    const { calls, result } = await invoke("delete_watch", {});
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result.isError, true);
  });
});

describe("update_watch handler", () => {
  it("by watch_id PATCHes new_name + novelty_min", async () => {
    const { calls, url } = await invoke("update_watch", {
      watch_id: "w1",
      new_name: "renamed",
      novelty_min: 0.8,
    });
    assert.strictEqual(methodOf(calls[0]), "PATCH");
    assert.ok(url?.pathname.endsWith("/watches/w1"));
    assert.deepStrictEqual(bodyOf(calls[0]), {
      name: "renamed",
      novelty_min: 0.8,
    });
  });

  it("retargeting criteria sends a filter seed", async () => {
    const { calls } = await invoke("update_watch", {
      watch_id: "w1",
      criteria: { has_code: true },
      recency_days: 30,
    });
    const seed = bodyOf(calls[0]).seed as Record<string, unknown>;
    assert.strictEqual(seed.kind, "filter");
    assert.strictEqual(seed.recency_days, 30);
  });

  it("errors when nothing to update", async () => {
    const { calls, result } = await invoke("update_watch", { watch_id: "w1" });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result.isError, true);
  });
});

describe("preview_watch handler", () => {
  it("POSTs the dry-run to /watches/preview", async () => {
    const { calls, url } = await invoke("preview_watch", {
      criteria: { categories: ["cs.SE"] },
      recency_days: 7,
    });
    assert.strictEqual(methodOf(calls[0]), "POST");
    assert.ok(url?.pathname.endsWith("/watches/preview"));
    const body = bodyOf(calls[0]);
    assert.strictEqual(body.match, "all");
    assert.strictEqual(body.recency_days, 7);
  });
});

// ---------------------------------------------------------------------------
// ask_library.ts — endpoint, scoping, validation, quota envelope passthrough
// ---------------------------------------------------------------------------

describe("ask_library handler", () => {
  it("GETs /ask with question + limit", async () => {
    const { url } = await invoke("ask_library", {
      question: "what is the consensus on KV-cache eviction?",
      limit: 8,
    });
    assert.ok(url?.pathname.endsWith("/ask"));
    assert.strictEqual(url?.searchParams.get("limit"), "8");
    assert.ok(
      url?.searchParams.get("question")?.startsWith("what is the consensus"),
    );
  });

  it("scopes to a collection_name when given", async () => {
    const { url } = await invoke("ask_library", {
      question: "summarize my reading on agents",
      collection_name: "agents",
      limit: 8,
    });
    assert.strictEqual(url?.searchParams.get("collection_name"), "agents");
  });

  it("rejects when both collection_name and collection_id are given", async () => {
    const { calls, result } = await invoke("ask_library", {
      question: "x".repeat(10),
      collection_name: "a",
      collection_id: "b",
      limit: 8,
    });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result.isError, true);
  });

  it("surfaces the quota { error, message } envelope verbatim", async () => {
    const message =
      "Free accounts get 1 question/month. Upgrade to Pro — scholarfeed.org/upgrade";
    const { result } = await invoke(
      "ask_library",
      { question: "x".repeat(10), limit: 8 },
      {
        status: 429,
        body: JSON.stringify({ error: "quota_exceeded", message }),
      },
    );
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes(message));
  });
});

// ---------------------------------------------------------------------------
// gaps.ts — exactly-one-seed, endpoint, pro_required passthrough
// ---------------------------------------------------------------------------

describe("find_gaps handler", () => {
  it("GETs /gaps with the single seed + scope + limit", async () => {
    const { url } = await invoke("find_gaps", {
      topic: "retrieval augmented generation",
      scope: "both",
      limit: 10,
    });
    assert.ok(url?.pathname.endsWith("/gaps"));
    assert.strictEqual(
      url?.searchParams.get("topic"),
      "retrieval augmented generation",
    );
    assert.strictEqual(url?.searchParams.get("scope"), "both");
  });

  it("rejects when more than one seed is given", async () => {
    const { calls, result } = await invoke("find_gaps", {
      topic: "a",
      collection_name: "b",
      scope: "both",
      limit: 10,
    });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result.isError, true);
  });

  it("rejects when no seed is given", async () => {
    const { calls, result } = await invoke("find_gaps", {
      scope: "both",
      limit: 10,
    });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result.isError, true);
  });

  it("surfaces the pro_required envelope verbatim (free account)", async () => {
    const message =
      "find_gaps is a Pro feature. Upgrade at scholarfeed.org/upgrade";
    const { result } = await invoke(
      "find_gaps",
      { topic: "agents", scope: "both", limit: 10 },
      { status: 403, body: JSON.stringify({ error: "pro_required", message }) },
    );
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes(message));
  });
});

// ---------------------------------------------------------------------------
// embed_text.ts — POST endpoint, body, pro_required passthrough
// ---------------------------------------------------------------------------

describe("embed_text handler", () => {
  it("POSTs text + task_type to /public/embeddings", async () => {
    const { calls, url } = await invoke("embed_text", {
      text: "a hypothetical abstract about KV-cache eviction",
      task_type: "RETRIEVAL_DOCUMENT",
    });
    assert.strictEqual(methodOf(calls[0]), "POST");
    assert.ok(url?.pathname.endsWith("/public/embeddings"));
    const body = bodyOf(calls[0]);
    assert.strictEqual(body.task_type, "RETRIEVAL_DOCUMENT");
    assert.ok(String(body.text).includes("KV-cache"));
  });

  it("surfaces the pro_required envelope verbatim (anon/free)", async () => {
    const message =
      "embed_text is Pro-only. Get a key at scholarfeed.org/settings";
    const { result } = await invoke(
      "embed_text",
      { text: "x", task_type: "RETRIEVAL_DOCUMENT" },
      { status: 403, body: JSON.stringify({ error: "pro_required", message }) },
    );
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes(message));
  });
});

// ---------------------------------------------------------------------------
// remaining read-only GET tools — endpoint, param passthrough, error wrapping
// ---------------------------------------------------------------------------

describe("get_citations handler", () => {
  it("GETs the citations route with direction/limit and optional fields/verbose", async () => {
    const { url } = await invoke("get_citations", {
      arxiv_id: "2407.15831",
      direction: "citing",
      limit: 20,
      verbose: true,
      exclude_ids: ["A", "B"],
    });
    assert.ok(url?.pathname.endsWith("/public/papers/2407.15831/citations"));
    assert.strictEqual(url?.searchParams.get("direction"), "citing");
    assert.strictEqual(url?.searchParams.get("verbose"), "true");
    assert.strictEqual(url?.searchParams.get("exclude_ids"), "A,B");
  });

  it("wraps a backend error as isError", async () => {
    const { result } = await invoke(
      "get_citations",
      { arxiv_id: "A", direction: "cited_by", limit: 20 },
      { status: 500, body: "boom" },
    );
    assert.strictEqual(result.isError, true);
  });
});

describe("co_author_graph handler", () => {
  it("GETs the co-author route with comma-joined ids + window", async () => {
    const { url } = await invoke("co_author_graph", {
      author_ids: [1, 2, 3],
      window_years: 5,
    });
    assert.ok(url?.pathname.endsWith("/public/authors/co-author-graph"));
    assert.strictEqual(url?.searchParams.get("author_ids"), "1,2,3");
    assert.strictEqual(url?.searchParams.get("window_years"), "5");
  });

  it("wraps a backend error as isError", async () => {
    const { result } = await invoke(
      "co_author_graph",
      { author_ids: [1], window_years: 10 },
      { status: 500, body: "boom" },
    );
    assert.strictEqual(result.isError, true);
  });
});

describe("get_field_orientation handler", () => {
  it("GETs /public/field-orientation with topic + limit", async () => {
    const { url } = await invoke("get_field_orientation", {
      topic: "efficient attention for long context",
      limit: 15,
    });
    assert.ok(url?.pathname.endsWith("/public/field-orientation"));
    assert.strictEqual(
      url?.searchParams.get("topic"),
      "efficient attention for long context",
    );
    assert.strictEqual(url?.searchParams.get("limit"), "15");
  });

  it("wraps a backend error as isError", async () => {
    const { result } = await invoke(
      "get_field_orientation",
      { topic: "x".repeat(6), limit: 15 },
      { throwError: new Error("net") },
    );
    assert.strictEqual(result.isError, true);
  });
});

describe("get_foundational_lineage handler", () => {
  it("GETs /public/foundational-lineage with anchor/scope/ceiling/limit", async () => {
    const { url } = await invoke("get_foundational_lineage", {
      anchor_paper_id: "2504.04704",
      scope: "narrow",
      generality_ceiling: false,
      limit: 15,
    });
    assert.ok(url?.pathname.endsWith("/public/foundational-lineage"));
    assert.strictEqual(url?.searchParams.get("anchor_paper_id"), "2504.04704");
    assert.strictEqual(url?.searchParams.get("scope"), "narrow");
    assert.strictEqual(url?.searchParams.get("generality_ceiling"), "false");
  });

  it("wraps a backend error as isError", async () => {
    const { result } = await invoke(
      "get_foundational_lineage",
      {
        anchor_paper_id: "2504.04704",
        scope: "field",
        generality_ceiling: true,
        limit: 15,
      },
      { status: 500, body: "boom" },
    );
    assert.strictEqual(result.isError, true);
  });
});

// ---------------------------------------------------------------------------
// notes.ts — annotate_paper (upsert / get / delete)
//
// The tool exists because PUT /notes/{id} was unreachable: JWT-only auth 401'd
// every API-key call, and the route addressed papers by internal UUID which the
// public API never exposes. Both were fixed backend-side 2026-09-03, so these
// assert the arXiv-ID path and the PUT verb the client only just learned.
// ---------------------------------------------------------------------------

describe("annotate_paper handler", () => {
  const NOTE = {
    id: "n1",
    paper_id: "967a85d7-ca96-4414-85f1-1539a4cc3597",
    note_text: "our baseline — beat this on the 7B setting",
    created_at: "2026-09-03T12:00:00Z",
    updated_at: "2026-09-03T12:00:00Z",
  };

  it("PUTs the note to /notes/<arxiv_id> and reports Saved on first write", async () => {
    const { calls, url, result } = await invoke(
      "annotate_paper",
      { arxiv_id: "2503.08669", note_text: NOTE.note_text, action: "upsert" },
      { json: NOTE },
    );
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(methodOf(calls[0]), "PUT");
    assert.ok(url?.pathname.endsWith("/notes/2503.08669"));
    assert.deepStrictEqual(bodyOf(calls[0]), { note_text: NOTE.note_text });
    assert.match(result.content[0].text, /Saved your note/);
  });

  it("reports Updated when the row already existed (updated_at moved)", async () => {
    const { result } = await invoke(
      "annotate_paper",
      { arxiv_id: "2503.08669", note_text: "revised", action: "upsert" },
      { json: { ...NOTE, updated_at: "2026-09-03T13:00:00Z" } },
    );
    assert.match(result.content[0].text, /Updated your note/);
  });

  it("upsert without note_text is a client-side error, not a request", async () => {
    const { calls, result } = await invoke(
      "annotate_paper",
      { arxiv_id: "2503.08669", action: "upsert" },
      { json: NOTE },
    );
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /note_text is required/);
  });

  it("action=get reads without writing", async () => {
    const { calls, url, result } = await invoke(
      "annotate_paper",
      { arxiv_id: "2503.08669", action: "get" },
      { json: NOTE },
    );
    assert.strictEqual(calls.length, 1);
    assert.notStrictEqual(methodOf(calls[0]), "PUT");
    assert.ok(url?.pathname.endsWith("/notes/2503.08669"));
    assert.strictEqual(
      (result.structuredContent as { note_text?: string }).note_text,
      NOTE.note_text,
    );
  });

  it("surfaces a backend error instead of pretending the note was written", async () => {
    const { result } = await invoke(
      "annotate_paper",
      { arxiv_id: "9999.99999", note_text: "x", action: "upsert" },
      { status: 404, json: { detail: "No paper found for '9999.99999'" } },
    );
    assert.strictEqual(result.isError, true);
  });
});
