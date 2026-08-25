/**
 * Client-IP forwarding: the end caller's IP reaches the backend ONLY as a matched
 * pair with the shared proxy secret.
 *
 * WHY THIS IS LOAD-BEARING. The hosted remote (mcp.scholarfeed.org) previously
 * forwarded no client IP at all, so every anonymous caller arrived at the backend
 * keyed to our Worker's egress IP. Two consequences, both measured in prod: all
 * anonymous callers shared ONE rate-limit bucket, and `usage_events.client_hash`
 * counted egress IPs rather than clients (394 hashes on the MCP surface, with a
 * bias direction that is genuinely indeterminate rather than merely unknown).
 *
 * The backend honors X-Real-Client-IP only when X-Proxy-Secret matches its own
 * PROXY_SECRET, falling through to X-Forwarded-For otherwise. So the IP alone is
 * inert, and emitting it alone would read as meaningful while being silently
 * ignored. These tests pin BOTH directions of that pairing, plus the stdio path
 * where forwarding must not happen at all (a stdio client reaches the backend
 * directly, so Heroku's X-Forwarded-For already carries its real IP).
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { client } from "../client.js";
import { runWithCreds } from "../http/credentials.js";

interface Captured {
  realClientIp: string | null;
  proxySecret: string | null;
  session: string | null;
}

const CALLER_IP = "203.0.113.47";
const SECRET = "test_proxy_secret_value";

describe("client IP forwarding (X-Real-Client-IP paired with X-Proxy-Secret)", () => {
  let backend: Server;
  const captured: Captured[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = ["SF_API_BASE_URL", "SF_PROXY_SECRET", "SF_API_KEY"];

  before(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

    backend = http.createServer((req, res) => {
      captured.push({
        realClientIp:
          (req.headers["x-real-client-ip"] as string | undefined) ?? null,
        proxySecret:
          (req.headers["x-proxy-secret"] as string | undefined) ?? null,
        session: (req.headers["x-sf-session"] as string | undefined) ?? null,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ items: [], total: 0 }));
    });
    await new Promise<void>((r) => backend.listen(0, () => r()));
    const { port } = backend.address() as AddressInfo;
    process.env.SF_API_BASE_URL = `http://127.0.0.1:${port}`;
    delete process.env.SF_API_KEY;
  });

  after(async () => {
    await new Promise<void>((r) => backend.close(() => r()));
    for (const k of ENV_KEYS) {
      const v = savedEnv[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => {
    captured.length = 0;
  });

  it("forwards the caller IP verbatim when BOTH the IP and the secret are present", async () => {
    process.env.SF_PROXY_SECRET = SECRET;
    await runWithCreds(
      { apiKey: null, sessionId: "s-1", clientIp: CALLER_IP },
      () => client.get("/library"),
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].realClientIp, CALLER_IP);
    assert.equal(captured[0].proxySecret, SECRET);
  });

  it("sends NEITHER header when the secret is unconfigured (no-op until deployed)", async () => {
    delete process.env.SF_PROXY_SECRET;
    await runWithCreds(
      { apiKey: null, sessionId: "s-2", clientIp: CALLER_IP },
      () => client.get("/library"),
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].realClientIp, null);
    assert.equal(captured[0].proxySecret, null);
  });

  it("sends NEITHER header when CF-Connecting-IP was absent, even with a secret set", async () => {
    process.env.SF_PROXY_SECRET = SECRET;
    await runWithCreds({ apiKey: null, sessionId: "s-3", clientIp: null }, () =>
      client.get("/library"),
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].realClientIp, null);
    // The secret must never ship on its own either.
    assert.equal(captured[0].proxySecret, null);
  });

  it("never forwards on the stdio path (no ALS context), even with a secret set", async () => {
    process.env.SF_PROXY_SECRET = SECRET;
    await client.get("/library");
    assert.equal(captured.length, 1);
    assert.equal(captured[0].realClientIp, null);
    assert.equal(captured[0].proxySecret, null);
    // Sanity: the stdio path still stamps its per-process session id, so this
    // asserts absence of forwarding rather than absence of a request.
    assert.ok(captured[0].session);
  });
});
