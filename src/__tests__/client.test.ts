/**
 * HTTP client tests — exercise the real client with a mocked global fetch.
 * Config is read at call time, so each test sets env and restores it after.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { client } from "../client.js";
import { stubFetch, headerOf, type CapturedRequest } from "./helpers.js";

const ENV_KEYS = ["SF_API_KEY", "SF_API_BASE_URL", "SF_API_TIMEOUT_MS"];

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const TEST_BASE = "https://example.test/api/v1";

/** Run fn with a stubbed fetch + clean env, always restoring after. */
async function withStub(
  opts: Parameters<typeof stubFetch>[0],
  env: Record<string, string | undefined>,
  fn: (calls: CapturedRequest[]) => Promise<void>,
): Promise<void> {
  const snap = snapshotEnv();
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SF_API_BASE_URL = TEST_BASE;
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k] = v;
  }
  const f = stubFetch(opts);
  try {
    await fn(f.calls);
  } finally {
    f.restore();
    restoreEnv(snap);
  }
}

describe("client auth headers", () => {
  it("attaches a Bearer header when SF_API_KEY is set", async () => {
    await withStub({}, { SF_API_KEY: "sf_test_key" }, async (calls) => {
      await client.get("/public/health");
      assert.strictEqual(
        headerOf(calls[0], "Authorization"),
        "Bearer sf_test_key",
      );
    });
  });

  it("omits the Authorization header when no key is set", async () => {
    await withStub({}, {}, async (calls) => {
      await client.get("/public/health");
      assert.strictEqual(headerOf(calls[0], "Authorization"), undefined);
    });
  });
});

describe("client session header", () => {
  it("stamps a stable X-SF-Session UUID on every request, across verbs", async () => {
    await withStub({}, {}, async (calls) => {
      await client.get("/public/health");
      await client.post("/likes", { paper_id: "p1" });
      const s1 = headerOf(calls[0], "X-SF-Session");
      const s2 = headerOf(calls[1], "X-SF-Session");
      assert.match(
        s1 ?? "",
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      // One id for the whole process, identical across calls and verbs, so the
      // backend can collapse an agent's fan-out into a single session.
      assert.strictEqual(s1, s2);
    });
  });

  it("sends the session id even on anonymous (unkeyed) requests", async () => {
    await withStub({}, {}, async (calls) => {
      await client.get("/public/health");
      assert.notStrictEqual(headerOf(calls[0], "X-SF-Session"), undefined);
      assert.strictEqual(headerOf(calls[0], "Authorization"), undefined);
    });
  });
});

describe("client URL building", () => {
  it("honors SF_API_BASE_URL and appends flat query params", async () => {
    await withStub({}, {}, async (calls) => {
      await client.get("/public/papers/search", { q: "rag", limit: "5" });
      const url = new URL(calls[0].url);
      assert.strictEqual(
        url.origin + url.pathname,
        `${TEST_BASE}/public/papers/search`,
      );
      assert.strictEqual(url.searchParams.get("q"), "rag");
      assert.strictEqual(url.searchParams.get("limit"), "5");
    });
  });

  it("getWithParams emits repeated array params", async () => {
    await withStub({}, {}, async (calls) => {
      const search = new URLSearchParams();
      search.append("arxiv_ids[]", "A");
      search.append("arxiv_ids[]", "B");
      search.set("verbose", "true");
      await client.getWithParams("/public/papers", search);
      const url = new URL(calls[0].url);
      assert.deepStrictEqual(url.searchParams.getAll("arxiv_ids[]"), [
        "A",
        "B",
      ]);
      assert.strictEqual(url.searchParams.get("verbose"), "true");
    });
  });
});

describe("client error mapping", () => {
  it("maps 401 to an actionable auth message", async () => {
    await withStub({ status: 401, body: "unauthorized" }, {}, async () => {
      await assert.rejects(client.get("/x"), /Authentication failed/);
    });
  });

  it("maps 429 to a rate-limit message", async () => {
    await withStub({ status: 429, body: "slow down" }, {}, async () => {
      await assert.rejects(client.get("/x"), /Rate limit exceeded/);
    });
  });

  it("hides the response body on other errors (no internal leak)", async () => {
    await withStub(
      { status: 500, body: "SECRET_INTERNAL_TRACE" },
      {},
      async () => {
        await assert.rejects(client.get("/x"), (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          assert.match(msg, /HTTP 500/);
          assert.doesNotMatch(msg, /SECRET_INTERNAL_TRACE/);
          return true;
        });
      },
    );
  });

  it("surfaces a deliberate { error, message } envelope (e.g. cap/upgrade walls)", async () => {
    const body = JSON.stringify({
      error: "watch_limit",
      message:
        "Free tier includes 1 watch. Pro lets you track more — scholarfeed.org/upgrade",
      limit: 1,
    });
    await withStub({ status: 403, body }, {}, async () => {
      await assert.rejects(client.get("/watches"), (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        // The backend's message wins over the generic 403 "Access denied" copy.
        assert.match(msg, /Pro lets you track more/);
        assert.doesNotMatch(msg, /Access denied/);
        return true;
      });
    });
  });

  it("ignores a half-formed envelope (message without error code → generic copy)", async () => {
    // message-only is NOT a deliberate envelope; must not surface, to avoid
    // leaking incidental error strings the backend didn't intend for users.
    await withStub(
      { status: 403, body: JSON.stringify({ message: "raw internal detail" }) },
      {},
      async () => {
        await assert.rejects(client.get("/x"), (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          assert.match(msg, /Access denied/);
          assert.doesNotMatch(msg, /raw internal detail/);
          return true;
        });
      },
    );
  });
});

describe("client timeout", () => {
  it("maps an aborted/timed-out fetch to a clear message", async () => {
    const timeoutErr = new Error("aborted");
    timeoutErr.name = "TimeoutError";
    await withStub({ throwError: timeoutErr }, {}, async () => {
      await assert.rejects(client.get("/x"), /timed out/i);
    });
  });
});

describe("client malformed-body defense (P0-1)", () => {
  // A 2xx with a non-JSON body — a proxy/CDN HTML interstitial (Heroku 502 page),
  // a truncated body — must NOT throw an opaque SyntaxError that leaks the raw
  // upstream fragment to the model. It must become a clean, sanitized error.
  it("turns a non-JSON 2xx body into a clean error, leaking no upstream HTML", async () => {
    await withStub(
      {
        status: 200,
        body: "<html><body>502 Bad Gateway from cdn</body></html>",
      },
      {},
      async () => {
        await assert.rejects(client.get("/x"), (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          assert.match(msg, /unreadable \(non-JSON\) response \(HTTP 200\)/);
          assert.doesNotMatch(msg, /<html>/); // raw upstream fragment not surfaced
          assert.doesNotMatch(msg, /502 Bad Gateway/);
          assert.doesNotMatch(msg, /Unexpected token/i); // not the opaque parser error
          return true;
        });
      },
    );
  });

  it("turns an empty 2xx body into the same clean error", async () => {
    await withStub({ status: 200, body: "" }, {}, async () => {
      await assert.rejects(
        client.get("/x"),
        /unreadable \(non-JSON\) response/,
      );
    });
  });
});

describe("client DELETE body handling", () => {
  it("returns null on 204 No Content (the membership-removal common case)", async () => {
    await withStub({ status: 204 }, {}, async (calls) => {
      const r = await client.del("/collections/c1/papers/p1");
      assert.strictEqual(r, null);
      assert.strictEqual((calls[0].init as RequestInit).method, "DELETE");
    });
  });

  it("returns null on a 200 with an empty body", async () => {
    await withStub({ status: 200, body: "" }, {}, async () => {
      assert.strictEqual(await client.del("/x"), null);
    });
  });

  it("parses a 200 DELETE JSON body", async () => {
    await withStub({ status: 200, json: { removed: 2 } }, {}, async () => {
      assert.deepStrictEqual(await client.del<{ removed: number }>("/x"), {
        removed: 2,
      });
    });
  });

  it("turns a non-JSON 200 DELETE body into a clean error (no leak)", async () => {
    await withStub({ status: 200, body: "<html>oops</html>" }, {}, async () => {
      await assert.rejects(client.del("/x"), (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.match(msg, /unreadable \(non-JSON\) response/);
        assert.doesNotMatch(msg, /<html>/);
        return true;
      });
    });
  });
});
