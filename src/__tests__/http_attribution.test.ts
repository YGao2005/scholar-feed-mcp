/**
 * Caller attribution on the Node entry point behind a reverse proxy (the VPS: nginx behind
 * Cloudflare). The backend keys anonymous quotas on X-Real-Client-IP (+ X-Proxy-Secret);
 * without it every anonymous caller shares the proxy's one quota — the gap found when
 * mcp.scholarfeed.org moved off Workers.
 *
 * Drives the real createApp() over the wire against a capture server and asserts:
 *   1. with a clientIpHeader configured, the caller IP from that header, `?src=` and the
 *      User-Agent reach the backend;
 *   2. with none configured (a directly exposed server), no client IP is forwarded even
 *      if a client sends the header — it is only trustworthy when a proxy overwrites it.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server-http.js";

type Headers = Record<string, string | string[] | undefined>;

describe("remote transport caller attribution", () => {
  let backend: Server;
  const captured: Headers[] = [];
  const saved: Record<string, string | undefined> = {};

  before(async () => {
    for (const k of ["SF_API_BASE_URL", "SF_PROXY_SECRET"])
      saved[k] = process.env[k];
    backend = http.createServer((req, res) => {
      captured.push(req.headers);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ items: [], total: 0 }));
    });
    await new Promise<void>((r) => backend.listen(0, () => r()));
    process.env.SF_API_BASE_URL = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
    process.env.SF_PROXY_SECRET = "test-proxy-secret";
  });

  after(async () => {
    await new Promise<void>((r) => backend.close(() => r()));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  async function callThrough(
    clientIpHeader: string | undefined,
  ): Promise<Headers> {
    const app = createApp({ clientIpHeader });
    let mcp!: Server;
    await new Promise<void>((r) => {
      mcp = app.listen(0, () => r());
    });
    try {
      captured.length = 0;
      const res = await fetch(
        `http://127.0.0.1:${(mcp.address() as AddressInfo).port}/mcp?src=claude-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "User-Agent": "attribution-test/1",
            "X-Real-IP": "203.0.113.7",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "list_library", arguments: { limit: 1, page: 1 } },
          }),
        },
      );
      await res.text();
      assert.strictEqual(
        captured.length,
        1,
        "backend should be called exactly once",
      );
      return captured[0];
    } finally {
      await new Promise<void>((r) => mcp.close(() => r()));
    }
  }

  it("forwards the proxy-set caller IP, ?src= and User-Agent when a header is configured", async () => {
    const h = await callThrough("x-real-ip");
    assert.strictEqual(h["x-real-client-ip"], "203.0.113.7");
    assert.strictEqual(h["x-proxy-secret"], "test-proxy-secret");
    assert.strictEqual(h["x-sf-src"], "claude-ai");
    assert.strictEqual(h["x-sf-client"], "attribution-test/1");
  });

  it("forwards no caller IP when no header is configured, whatever the client sends", async () => {
    const h = await callThrough(undefined);
    assert.strictEqual(h["x-real-client-ip"], undefined);
  });
});
