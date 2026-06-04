/**
 * Remote-transport credential threading: the load-bearing no-leak + concurrency
 * invariants the adversarial review flagged as proven-by-reading-but-untested.
 *
 * We point SF_API_BASE_URL at a local capture server that records the inbound
 * Authorization header, drive the real createApp() over the wire with
 * `tools/call`, and assert:
 *   1. an `sf_` bearer is forwarded VERBATIM as the backend Bearer;
 *   2. a NO-token request stays anonymous (no backend Authorization) EVEN WHEN
 *      process.env.SF_API_KEY is set — the central no-leak invariant
 *      (AsyncLocalStorage carries apiKey:null, and client.ts honors the null
 *      instead of falling back to the process env key);
 *   3. two CONCURRENT tools/call requests with DIFFERENT sf_ keys each forward
 *      their OWN key (no cross-request bleed under per-request ALS frames).
 *
 * This pins the invariant against SDK / @hono internal scheduling changes that
 * could silently break AsyncLocalStorage continuity.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server-http.js";

const MCP_ACCEPT = "application/json, text/event-stream";
const PROTOCOL_VERSION = "2025-11-25";

interface Captured {
  auth: string | null;
  path: string;
}

function toolCall(
  id: number,
  name: string,
  args: Record<string, unknown> = {},
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

describe("remote transport credential threading (no-leak + concurrency)", () => {
  let backend: Server; // captures outbound backend requests
  let mcp: Server; // the MCP HTTP server under test
  let mcpBase: string;
  const captured: Captured[] = [];
  const savedEnv: Record<string, string | undefined> = {};

  before(async () => {
    for (const k of ["SF_API_BASE_URL", "SF_API_KEY"])
      savedEnv[k] = process.env[k];

    // list_library issues GET /library through the shared client; we only care
    // about the Authorization header the backend receives, so answer everything
    // with a valid JSON 200.
    backend = http.createServer((req, res) => {
      captured.push({
        auth: (req.headers["authorization"] as string | undefined) ?? null,
        path: req.url ?? "",
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ items: [], total: 0 }));
    });
    await new Promise<void>((r) => backend.listen(0, () => r()));
    const { port: bport } = backend.address() as AddressInfo;
    process.env.SF_API_BASE_URL = `http://127.0.0.1:${bport}`;
    // The no-leak guard's worst case: a server-level key present in env.
    process.env.SF_API_KEY = "sf_SERVER_ENV_MUST_NOT_LEAK";

    const app = createApp();
    await new Promise<void>((r) => {
      mcp = app.listen(0, () => r());
    });
    const { port: mport } = mcp.address() as AddressInfo;
    mcpBase = `http://127.0.0.1:${mport}`;
  });

  after(async () => {
    await new Promise<void>((r) => mcp.close(() => r()));
    await new Promise<void>((r) => backend.close(() => r()));
    for (const k of ["SF_API_BASE_URL", "SF_API_KEY"]) {
      const v = savedEnv[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  async function callTool(
    auth: string | undefined,
    id: number,
  ): Promise<number> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: MCP_ACCEPT,
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (auth) headers.Authorization = auth;
    const res = await fetch(`${mcpBase}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(toolCall(id, "list_library", { limit: 1, page: 1 })),
    });
    await res.text();
    return res.status;
  }

  it("forwards an sf_ bearer verbatim as the backend Authorization", async () => {
    captured.length = 0;
    await callTool("Bearer sf_user_alpha_key", 1);
    assert.strictEqual(
      captured.length,
      1,
      "backend should be called exactly once",
    );
    assert.strictEqual(captured[0].auth, "Bearer sf_user_alpha_key");
  });

  it("a no-token request stays anonymous EVEN WITH process.env.SF_API_KEY set (no-leak)", async () => {
    captured.length = 0;
    await callTool(undefined, 2);
    assert.strictEqual(
      captured.length,
      1,
      "backend should be called exactly once",
    );
    assert.strictEqual(
      captured[0].auth,
      null,
      "an anonymous remote request must NOT forward the server's env SF_API_KEY",
    );
  });

  it("two concurrent requests with different sf_ keys each forward their OWN key", async () => {
    captured.length = 0;
    await Promise.all([
      callTool("Bearer sf_concurrent_AAA", 10),
      callTool("Bearer sf_concurrent_BBB", 11),
    ]);
    assert.strictEqual(captured.length, 2, "both backend calls should land");
    const auths = new Set(captured.map((c) => c.auth));
    assert.ok(
      auths.has("Bearer sf_concurrent_AAA"),
      "AAA key must be forwarded",
    );
    assert.ok(
      auths.has("Bearer sf_concurrent_BBB"),
      "BBB key must be forwarded",
    );
    assert.ok(
      !auths.has("Bearer sf_SERVER_ENV_MUST_NOT_LEAK"),
      "the server env key must never appear on any backend call",
    );
  });
});
