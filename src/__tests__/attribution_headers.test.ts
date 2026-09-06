/**
 * Attribution headers: which install a call came from (X-SF-Src) and what software
 * is calling (X-SF-Client), for usage_events (backend mig 174).
 *
 * WHY THIS IS LOAD-BEARING. Anonymous MCP traffic inverted between its two channels
 * over 90d — stdio/npm fell 28 -> 11 distinct source-IPs per week while the remote
 * Worker endpoint grew ~10 -> ~61 — and nothing recorded which listing produced any
 * of it. MCP has no referrer, so provenance can only be manufactured at install time
 * and carried on every call.
 *
 * The two paths get their values from DIFFERENT places, and the split is the thing
 * these tests pin:
 *   - remote  : per-request, from the ALS bag (?src= on the connect URL, User-Agent).
 *   - stdio   : per-process, from SF_SRC and the host's initialize clientInfo.
 *
 * The dangerous direction is remote falling back to process env: a Workers isolate is
 * SHARED between tenants, so a deployment-level SF_SRC would stamp every anonymous
 * caller with our own tag — attribution that looks real and is not. That is asserted
 * explicitly below.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  client,
  setStdioClientName,
  __resetStdioClientName,
} from "../client.js";
import { runWithCreds } from "../http/credentials.js";

interface Captured {
  src: string | null;
  client: string | null;
  session: string | null;
}

describe("attribution headers (X-SF-Src / X-SF-Client)", () => {
  let backend: Server;
  const captured: Captured[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = ["SF_API_BASE_URL", "SF_SRC", "SF_API_KEY"];

  before(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    backend = http.createServer((req, res) => {
      captured.push({
        src: (req.headers["x-sf-src"] as string | undefined) ?? null,
        client: (req.headers["x-sf-client"] as string | undefined) ?? null,
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
    __resetStdioClientName();
  });

  beforeEach(() => {
    captured.length = 0;
    delete process.env.SF_SRC;
    __resetStdioClientName();
  });

  // --- remote: per-request from the ALS bag ------------------------------

  it("forwards ?src= and the User-Agent supplied per request", async () => {
    await runWithCreds(
      {
        apiKey: null,
        sessionId: "s-1",
        src: "smithery",
        client: "claude-ai/1.0",
      },
      () => client.get("/library"),
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].src, "smithery");
    assert.equal(captured[0].client, "claude-ai/1.0");
  });

  it("omits each header independently when its value is absent", async () => {
    await runWithCreds(
      { apiKey: null, sessionId: "s-2", src: null, client: "cursor/1.4" },
      () => client.get("/library"),
    );
    assert.equal(captured[0].src, null);
    assert.equal(captured[0].client, "cursor/1.4");
  });

  it("🔴 does NOT fall back to a deployment-level SF_SRC on the remote path", async () => {
    // A Workers isolate is shared between tenants. Falling back here would tag every
    // anonymous caller with the deployment's own slug — worse than no attribution,
    // because it is indistinguishable from a real one downstream.
    process.env.SF_SRC = "our-own-deployment-tag";
    await runWithCreds(
      { apiKey: null, sessionId: "s-3", src: null, client: null },
      () => client.get("/library"),
    );
    assert.equal(captured[0].src, null);
    assert.equal(captured[0].client, null);
    // Sanity: the request still happened, so this asserts absence of the tag rather
    // than absence of a call.
    assert.ok(captured[0].session);
  });

  // --- stdio: per-process from env + the initialize handshake ------------

  it("uses SF_SRC and the initialize client name on the stdio path", async () => {
    process.env.SF_SRC = "npm-readme";
    setStdioClientName("Claude Desktop");
    await client.get("/library");
    assert.equal(captured[0].src, "npm-readme");
    assert.equal(captured[0].client, "Claude Desktop");
  });

  it("sends neither header on a bare stdio process that set nothing", async () => {
    await client.get("/library");
    assert.equal(captured[0].src, null);
    assert.equal(captured[0].client, null);
    assert.ok(captured[0].session);
  });

  it("treats a blank or whitespace client name as unset", async () => {
    setStdioClientName("   ");
    await client.get("/library");
    assert.equal(captured[0].client, null);
    setStdioClientName(undefined);
    await client.get("/library");
    assert.equal(captured[1].client, null);
  });
});
