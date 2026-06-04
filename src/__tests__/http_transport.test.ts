/**
 * Remote (Streamable HTTP) transport smoke test.
 *
 * Starts the real createApp() on an ephemeral port (app.listen(0)) and drives it
 * with global fetch over the wire — no supertest, only built-ins + the app. The
 * goal is to prove the stateless transport is mounted and serves the full MCP
 * tool surface end to end:
 *   1. POST /mcp initialize -> a successful JSON-RPC result
 *   2. POST /mcp tools/list -> all 25 tools (this does NOT call the backend, so
 *      no network is needed)
 *   3. GET /mcp -> 405 (stateless)
 *
 * Stateless transport detail: each POST gets a fresh McpServer + transport, so
 * `tools/list` is a self-contained request (validateSession is a no-op when
 * sessionIdGenerator is undefined). The MCP-Protocol-Version header IS required
 * on non-initialize requests, so we send a supported version. The transport
 * answers a single request as an SSE stream by default, so the body parser below
 * handles BOTH application/json and text/event-stream framings.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp, isOriginAllowed, isHostAllowed } from "../server-http.js";

const PROTOCOL_VERSION = "2025-11-25";
const MCP_ACCEPT = "application/json, text/event-stream";

interface JsonRpcEnvelope {
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Extract the JSON-RPC envelope from a /mcp POST response, tolerant of the two
 * framings the transport can use:
 *   - application/json: the body IS the envelope.
 *   - text/event-stream: one or more `data: {...}` lines; take the last data
 *     payload that parses to a JSON-RPC envelope.
 */
function parseMcpResponse(contentType: string, body: string): JsonRpcEnvelope {
  if (contentType.includes("application/json")) {
    return JSON.parse(body) as JsonRpcEnvelope;
  }
  if (contentType.includes("text/event-stream")) {
    const dataPayloads = body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((s) => s.length > 0);
    assert.ok(
      dataPayloads.length > 0,
      `SSE response carried no data lines:\n${body}`,
    );
    // The JSON-RPC result is the last data payload for the request stream.
    return JSON.parse(dataPayloads[dataPayloads.length - 1]) as JsonRpcEnvelope;
  }
  throw new Error(`Unexpected content-type from /mcp: ${contentType}`);
}

async function postMcp(
  baseUrl: string,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; envelope: JsonRpcEnvelope }> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: MCP_ACCEPT,
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  return { status: res.status, envelope: parseMcpResponse(contentType, text) };
}

describe("remote HTTP transport (Streamable HTTP, stateless)", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("answers a JSON-RPC initialize over POST /mcp", async () => {
    const { status, envelope } = await postMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "http-smoke", version: "0" },
      },
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(envelope.jsonrpc, "2.0");
    assert.strictEqual(envelope.error, undefined);
    const result = envelope.result as {
      serverInfo?: {
        name?: string;
        title?: string;
        icons?: Array<{ src?: string }>;
      };
      protocolVersion?: string;
    };
    assert.strictEqual(result.serverInfo?.name, "scholar-feed");
    // Branding the host renders for the connector (title + logo icon).
    assert.strictEqual(result.serverInfo?.title, "Scholar Feed");
    assert.ok(
      result.serverInfo?.icons?.[0]?.src?.startsWith("https://"),
      "serverInfo must advertise an https icon for the connector logo",
    );
  });

  it("lists all 25 tools over POST /mcp tools/list", async () => {
    const { status, envelope } = await postMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(envelope.error, undefined);
    const result = envelope.result as { tools: Array<{ name: string }> };
    assert.ok(
      Array.isArray(result.tools),
      "tools/list must return a tools array",
    );
    assert.strictEqual(
      result.tools.length,
      25,
      `expected 25 tools, got ${result.tools.length}: ${result.tools
        .map((t) => t.name)
        .join(", ")}`,
    );
    // Spot-check a representative read tool and a write tool are present.
    const names = new Set(result.tools.map((t) => t.name));
    assert.ok(names.has("search_papers"), "search_papers must be registered");
    assert.ok(names.has("save_paper"), "save_paper must be registered");
  });

  it("returns 405 for GET /mcp (stateless: no stream to resume)", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "GET",
      headers: { Accept: MCP_ACCEPT },
    });
    assert.strictEqual(res.status, 405);
  });

  it("returns 405 for DELETE /mcp (stateless: no session to delete)", async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
    assert.strictEqual(res.status, 405);
  });
});

describe("DNS-rebinding guards (Origin + Host)", () => {
  it("isOriginAllowed: allows no-Origin and loopback (incl. bracketed [::1]); rejects others", () => {
    assert.strictEqual(isOriginAllowed(undefined), true);
    assert.strictEqual(isOriginAllowed("http://localhost:3000"), true);
    assert.strictEqual(isOriginAllowed("http://127.0.0.1:5173"), true);
    assert.strictEqual(isOriginAllowed("http://[::1]:8080"), true); // IPv6 loopback
    assert.strictEqual(isOriginAllowed("https://evil.example"), false);
    assert.strictEqual(isOriginAllowed("not a url"), false);
  });

  it("isHostAllowed: loopback ok; missing/non-loopback rejected unless allowlisted", () => {
    assert.strictEqual(isHostAllowed("127.0.0.1:3000"), true);
    assert.strictEqual(isHostAllowed("localhost:3000"), true);
    assert.strictEqual(isHostAllowed("[::1]:3000"), true);
    assert.strictEqual(isHostAllowed(undefined), false);
    assert.strictEqual(isHostAllowed("evil.example"), false); // no allowlist -> reject
    const prev = process.env.SF_MCP_ALLOWED_HOSTS;
    process.env.SF_MCP_ALLOWED_HOSTS = "mcp.scholarfeed.org";
    try {
      assert.strictEqual(isHostAllowed("mcp.scholarfeed.org"), true);
      assert.strictEqual(isHostAllowed("evil.example"), false);
    } finally {
      if (prev === undefined) delete process.env.SF_MCP_ALLOWED_HOSTS;
      else process.env.SF_MCP_ALLOWED_HOSTS = prev;
    }
  });
});
