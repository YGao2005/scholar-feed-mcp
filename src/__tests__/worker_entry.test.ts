/**
 * Worker entry point: the credential-resolver selection and the browser CORS surface.
 *
 * WHY THIS FILE EXISTS. Until now NO test imported src/worker.ts at all — every
 * wire-level OAuth assertion targeted the Express createApp(). That gap is exactly
 * how the two entry points diverged in production: server-http.ts wired the real
 * MintedKeyCredentialResolver while worker.ts hardcoded the fail-loud stub, so on the
 * deployed Worker a caller could complete an OAuth sign-in and then receive 501 on
 * every account tool. Discovery, the AS, DCR and the 401 challenge all worked; only
 * the credential bridge behind them was missing, which is precisely the kind of hole
 * an entry-point-shaped test catches and a unit test does not.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker, {
  getCredentialResolver,
  __resetCredentialResolver,
} from "../worker.js";
import { UNCONFIGURED_RESOLVER_MESSAGE } from "../http/oauth/credential-resolver.js";

const ORIGIN = "https://claude.ai";
const HOST = "mcp.scholarfeed.org";

/** The static config the guards and the verifier read (normally via the bridge). */
const ENV = {
  SF_MCP_ALLOWED_ORIGINS: ORIGIN,
  SF_MCP_ALLOWED_HOSTS: HOST,
  SF_MCP_AUDIENCE: `https://${HOST}/mcp`,
  SF_MCP_RESOURCE_URI: `https://${HOST}/mcp`,
  SF_OAUTH_ISSUER: "https://example.supabase.co/auth/v1",
  SF_OAUTH_JWKS_URL: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
  SF_OAUTH_ENFORCE_ISSUER: "false",
} as const;

const ENV_KEYS = Object.keys(ENV) as (keyof typeof ENV)[];
const saved: Record<string, string | undefined> = {};

function mcpRequest(method: string, headers: Record<string, string>): Request {
  return new Request(`https://${HOST}/mcp`, { method, headers });
}

describe("worker entry — credential resolver selection", () => {
  beforeEach(() => __resetCredentialResolver());
  after(() => __resetCredentialResolver());

  it("falls back to the fail-loud resolver when no provisioning secret is set", async () => {
    const resolver = getCredentialResolver({});
    // The Unconfigured resolver is identified by the vetted, secret-free message it
    // throws — the same string resolve-creds turns into the honest 501.
    await assert.rejects(
      () => Promise.resolve(resolver.resolve({ subject: "u-1" } as never)),
      (err: Error) => {
        assert.match(err.message, new RegExp(UNCONFIGURED_RESOLVER_MESSAGE.slice(0, 20)));
        return true;
      },
    );
  });

  it("🔴 selects the REAL minted-key resolver once the secret is present", async () => {
    // The regression this whole file exists for: prod ran the stub, so a valid OAuth
    // token 501'd on every account tool.
    const resolver = getCredentialResolver({
      SF_MCP_PROVISION_SECRET: "test-secret",
      SF_API_BASE_URL: "https://api.example.test/api/v1",
    });
    assert.equal(resolver.constructor.name, "MintedKeyCredentialResolver");
  });

  it("memoises per isolate so the key cache is not rebuilt per request", () => {
    const env = { SF_MCP_PROVISION_SECRET: "test-secret" };
    assert.equal(getCredentialResolver(env), getCredentialResolver(env));
  });

  it("reads the secret from the env bag, never from process.env", () => {
    // SF_MCP_PROVISION_SECRET is deliberately absent from CONFIG_ENV_KEYS, so the
    // bridge never copies it; an env-bag-only read is what makes that safe.
    const before = process.env.SF_MCP_PROVISION_SECRET;
    process.env.SF_MCP_PROVISION_SECRET = "leaked-from-process-env";
    try {
      assert.equal(
        getCredentialResolver({}).constructor.name,
        "UnconfiguredCredentialResolver",
      );
    } finally {
      if (before === undefined) delete process.env.SF_MCP_PROVISION_SECRET;
      else process.env.SF_MCP_PROVISION_SECRET = before;
    }
  });
});

describe("worker entry — CORS for browser MCP hosts", () => {
  before(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      process.env[k] = ENV[k];
    }
  });
  after(() => {
    for (const k of ENV_KEYS) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("answers an allowed-origin preflight with 204 and exposes WWW-Authenticate", async () => {
    const res = await worker.fetch(
      mcpRequest("OPTIONS", {
        origin: ORIGIN,
        host: HOST,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      }),
      ENV,
    );
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
    // Without this the browser hides the 401's challenge and OAuth cannot start.
    assert.equal(res.headers.get("access-control-expose-headers"), "WWW-Authenticate");
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /POST/);
    assert.match(res.headers.get("vary") ?? "", /Origin/);
  });

  it("echoes the requested headers rather than guessing the MCP header set", async () => {
    // The MCP header set has grown before (mcp-session-id, mcp-protocol-version); a
    // hardcoded list would silently break a host the next time it grows.
    const res = await worker.fetch(
      mcpRequest("OPTIONS", {
        origin: ORIGIN,
        host: HOST,
        "access-control-request-headers": "authorization,mcp-protocol-version",
      }),
      ENV,
    );
    assert.match(
      res.headers.get("access-control-allow-headers") ?? "",
      /mcp-protocol-version/,
    );
  });

  it("still 403s a disallowed origin — the rebinding guard runs BEFORE preflight", async () => {
    const res = await worker.fetch(
      mcpRequest("OPTIONS", { origin: "https://evil.example", host: HOST }),
      ENV,
    );
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("leaves a non-browser OPTIONS on the normal 405 surface", async () => {
    const res = await worker.fetch(mcpRequest("OPTIONS", { host: HOST }), ENV);
    assert.equal(res.status, 405);
  });
});
