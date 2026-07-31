/**
 * HTTP client tests — exercise the real client with a mocked global fetch.
 * Config is read at call time, so each test sets env and restores it after.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { client } from "../client.js";
import { runWithCreds } from "../http/credentials.js";
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

  it("keeps the generic copy for status-derived 429 codes, but surfaces the anon-cap one", async () => {
    // rate_limited / too_many_requests are derived from the status, so their detail
    // adds nothing — keep the actionable generic copy. anon_daily_limit is a
    // hand-authored detail that names the actual cap, so it should win.
    await withStub(
      {
        status: 429,
        body: JSON.stringify({
          status: 429,
          detail: "Rate limit exceeded: 30 per 1 minute",
          code: "rate_limited",
        }),
      },
      {},
      async () => {
        await assert.rejects(
          client.get("/x"),
          /Add an API key for higher limits/,
        );
      },
    );
    await withStub(
      {
        status: 429,
        body: JSON.stringify({
          status: 429,
          detail:
            "Anonymous daily limit (100) exceeded. Add an API key for higher limits — get one free at https://www.scholarfeed.org/settings",
          code: "anon_daily_limit",
        }),
      },
      {},
      async () => {
        await assert.rejects(client.get("/x"), /Anonymous daily limit \(100\)/);
      },
    );
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
          assert.match(msg, /SF_API_KEY/); // the generic status-based 403 copy
          assert.doesNotMatch(msg, /raw internal detail/);
          return true;
        });
      },
    );
  });

  it("surfaces the RFC-9457 { code, detail } envelope (HTTPException gates)", async () => {
    // The backend re-renders every HTTPException as problem+json, so a gate's
    // `message` arrives as `detail` under a deliberate `code` — e.g. embed_text's
    // Pro gate. Without this the signal was dropped and the gate went opaque.
    const body = JSON.stringify({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      detail:
        "Text embeddings are a Pro feature. Start a free 14-day Pro trial or upgrade to keep using them.",
      code: "pro_required",
      upgrade_url: "/pricing",
    });
    await withStub({ status: 403, body }, { SF_API_KEY: "sf_ok" }, async () => {
      await assert.rejects(client.get("/public/embed"), (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.match(msg, /Text embeddings are a Pro feature/);
        return true;
      });
    });
  });

  it("relays watch_limit, a wall the backend emits but the client ignored", async () => {
    // api/routers/watches.py raises 403 code="watch_limit" with user-facing copy.
    // It was absent from ACTIONABLE_PROBLEM_CODES, so create_watch's wall fell
    // through to the generic status message and the agent lost the next step.
    const body = JSON.stringify({
      status: 403,
      detail: "Free accounts can keep 1 watch. Upgrade to track up to 50.",
      code: "watch_limit",
      upgrade_url: "/pricing",
    });
    await withStub({ status: 403, body }, { SF_API_KEY: "sf_ok" }, async () => {
      await assert.rejects(client.get("/watches"), (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.match(msg, /Free accounts can keep 1 watch/);
        return true;
      });
    });
  });

  it("appends the backend's upgrade_url as an ABSOLUTE link", async () => {
    // The backend sends relative CTAs ("/pricing") from five sites. A bare path is
    // useless to a model with no origin, and it was being dropped entirely.
    const body = JSON.stringify({
      status: 403,
      detail: "Daily limit reached.",
      code: "quota_exceeded",
      upgrade_url: "/pricing",
    });
    await withStub({ status: 403, body }, { SF_API_KEY: "sf_ok" }, async () => {
      await assert.rejects(client.get("/x"), (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        // Assert the exact suffix rather than "contains a URL": CodeQL flags both an
        // unanchored host regex and a bare includes() on a URL (js/regex/missing-
        // regexp-anchor, js/incomplete-url-substring-sanitization) because neither
        // proves WHICH host matched. The message ends with " (<cta>)", so an endsWith
        // on the full parenthesised form is both stricter and alert-free.
        assert.ok(
          msg.endsWith("(https://www.scholarfeed.org/pricing)"),
          `expected the absolute CTA at the end of: ${msg}`,
        );
        return true;
      });
    });
  });

  it("refuses an off-origin upgrade_url (phishing vector)", async () => {
    // upgrade_url arrives in an HTTP response body and lands in text the model relays
    // to a user as the thing to click, so an arbitrary absolute URL would be a
    // phishing vector — the same threat model that makes this codebase fence paper
    // content. Lookalike hosts must be rejected too: a substring check for
    // "scholarfeed.org" passes evil-scholarfeed.org and scholarfeed.org.attacker.test,
    // which is why withUpgradeUrl compares origins exactly.
    for (const evil of [
      "https://evil.test/pricing",
      "https://evil-scholarfeed.org/pricing",
      "https://www.scholarfeed.org.attacker.test/pricing",
      "http://www.scholarfeed.org/pricing", // wrong scheme -> different origin
      "javascript:alert(1)",
    ]) {
      const body = JSON.stringify({
        status: 403,
        detail: "Daily limit reached.",
        code: "quota_exceeded",
        upgrade_url: evil,
      });
      await withStub(
        { status: 403, body },
        { SF_API_KEY: "sf_ok" },
        async () => {
          await assert.rejects(client.get("/x"), (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            assert.ok(
              !msg.includes(evil),
              `off-origin CTA must be dropped, but message carried it: ${msg}`,
            );
            // The wall's own copy still reaches the agent; only the link is dropped.
            assert.ok(msg.includes("Daily limit reached."));
            return true;
          });
        },
      );
    }
  });

  it("does not double-append when the copy already carries a link", async () => {
    const body = JSON.stringify({
      status: 403,
      detail: "Upgrade at https://www.scholarfeed.org/pricing to continue.",
      code: "quota_exceeded",
      upgrade_url: "/pricing",
    });
    await withStub({ status: 403, body }, { SF_API_KEY: "sf_ok" }, async () => {
      await assert.rejects(client.get("/x"), (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        // Count occurrences by splitting on the literal rather than a global regex
        // (same CodeQL anchor rule as above; this is substring counting, not matching).
        assert.strictEqual(
          msg.split("scholarfeed.org/pricing").length - 1,
          1,
          `CTA must appear exactly once, got: ${msg}`,
        );
        return true;
      });
    });
  });

  it("does NOT admit an unlisted *_limit code (the allowlist stays fail-closed)", async () => {
    // A suffix rule (code.endsWith("_limit")) would auto-admit future codes,
    // including one whose detail carries internals — e.g. health.py's 503 stringifies
    // a raw connection error. New codes must be added explicitly, not matched.
    const body = JSON.stringify({
      status: 503,
      detail:
        "connection to host db.internal:5432 failed: password authentication",
      code: "db_connection_limit",
    });
    await withStub({ status: 503, body }, { SF_API_KEY: "sf_ok" }, async () => {
      await assert.rejects(client.get("/x"), (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.doesNotMatch(msg, /db\.internal|password/);
        return true;
      });
    });
  });

  it("does not let a generic problem+json code displace the actionable copy", async () => {
    // code='forbidden' is derived from the status alone and its detail is
    // FastAPI's bare "Not authenticated" — surfacing that would bury the
    // SF_API_KEY guidance the agent actually needs.
    const body = JSON.stringify({
      status: 403,
      detail: "Not authenticated",
      code: "forbidden",
    });
    await withStub({ status: 403, body }, {}, async () => {
      await assert.rejects(client.get("/x"), (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.match(msg, /SF_API_KEY/);
        return true;
      });
    });
  });

  it("tells a missing key (403 'Not authenticated') to set SF_API_KEY and not retry", async () => {
    // HTTPBearer(auto_error=True) answers an ABSENT Authorization header with
    // 403, not 401, so this — not the 401 branch — is the unconfigured path.
    await withStub(
      { status: 403, body: JSON.stringify({ detail: "Not authenticated" }) },
      {},
      async () => {
        await assert.rejects(client.get("/library"), (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          assert.match(msg, /SF_API_KEY/);
          assert.match(msg, /scholarfeed\.org\/settings/);
          assert.match(msg, /restart/i);
          assert.match(msg, /Do NOT retry/);
          return true;
        });
      },
    );
  });

  it("tells an anonymous REMOTE request to send an Authorization header, not to set SF_API_KEY", async () => {
    // On the remote transport each request carries its own key and SF_API_KEY must
    // never be set server-side (cross-tenant leak), so the stdio remedy is wrong there.
    await withStub(
      { status: 403, body: JSON.stringify({ detail: "Not authenticated" }) },
      {},
      async () => {
        await runWithCreds({ apiKey: null, sessionId: "s1" }, async () => {
          await assert.rejects(client.get("/library"), (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            assert.match(msg, /Authorization: Bearer sf_/);
            assert.match(msg, /Do NOT retry/);
            assert.doesNotMatch(msg, /SF_API_KEY/);
            return true;
          });
        });
      },
    );
  });

  it("claims a Pro gate only when the backend said pro_required", async () => {
    await withStub(
      {
        status: 403,
        body: JSON.stringify({ code: "pro_required", detail: "" }),
      },
      { SF_API_KEY: "sf_valid_key" },
      async () => {
        await assert.rejects(client.get("/public/embed"), (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          assert.match(msg, /requires a Scholar Feed Pro plan/);
          assert.match(msg, /scholarfeed\.org\/pricing/);
          // Names a concrete non-Pro fallback so the agent can keep working.
          assert.match(msg, /search_papers/);
          // Must NOT tell a correctly-configured caller to go set a key.
          assert.doesNotMatch(msg, /No API key was sent/);
          return true;
        });
      },
    );
  });

  it("does not assert key validity or upsell on an unexplained keyed 403", async () => {
    // A revoked key, an admin-only route, and a Cloudflare WAF block all land here.
    // The old copy said "Your SF_API_KEY is valid" and linked pricing — a confident
    // false claim plus a spend prompt for a problem money cannot fix.
    for (const body of [
      "",
      "<html><body>Attention Required! | Cloudflare</body></html>",
      JSON.stringify({ detail: "Admin access required", code: "forbidden" }),
    ]) {
      await withStub(
        { status: 403, body },
        { SF_API_KEY: "sf_revoked_or_blocked" },
        async () => {
          await assert.rejects(client.get("/public/embed"), (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            assert.doesNotMatch(msg, /is valid/);
            assert.doesNotMatch(msg, /pricing/);
            assert.doesNotMatch(msg, /No API key was sent/);
            assert.match(msg, /revoked|plan or role|WAF/);
            return true;
          });
        },
      );
    }
  });

  it("does not mistake an unrelated 'not authenticated' detail for a missing key", async () => {
    // Substring-matching the raw body stranded a working client: this 403 is about a
    // third-party integration, not our credentials.
    await withStub(
      {
        status: 403,
        body: JSON.stringify({
          detail: "Repo owner is not authenticated with GitHub",
          code: "forbidden",
        }),
      },
      { SF_API_KEY: "sf_valid_key" },
      async () => {
        await assert.rejects(client.get("/public/papers"), (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          assert.doesNotMatch(msg, /No API key was sent/);
          assert.doesNotMatch(msg, /Set SF_API_KEY/);
          return true;
        });
      },
    );
  });

  it("keeps an unrecognised problem code opaque (allowlist, not denylist)", async () => {
    // health.py raises 503 with detail={"error":"db_unavailable","message":str(e)},
    // which stringifies host/port/DSN. A denylist of status-derived codes would pass
    // any newly-named code straight through; the allowlist must fail closed.
    await withStub(
      {
        status: 503,
        body: JSON.stringify({
          detail:
            "psycopg2.OperationalError: could not connect to 10.0.3.14:5432 (pw=hunter2)",
          code: "db_unavailable",
        }),
      },
      {},
      async () => {
        await assert.rejects(client.get("/public/papers"), (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          assert.doesNotMatch(msg, /psycopg2|10\.0\.3\.14|hunter2/);
          assert.match(msg, /HTTP 503/);
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
