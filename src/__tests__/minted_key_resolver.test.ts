/**
 * MintedKeyCredentialResolver unit tests (credential-bridge "model a").
 *
 * Fully OFFLINE: an injected fetch records the provisioning call and returns a
 * canned response; an injected clock drives the cache TTL. We prove the
 * resolver forwards the verified sub/email with the provisioning secret header,
 * returns the minted sf_ key (never the user token), caches per-sub within the
 * TTL, re-fetches after expiry, and fails loud (without leaking the secret) on
 * a bad response. createDefaultCredentialResolver() is proven to pick the
 * fail-loud Unconfigured resolver when no secret is configured.
 *
 * CRITICAL: All logging uses console.error() not console.log().
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import {
  MintedKeyCredentialResolver,
  createDefaultCredentialResolver,
} from "../http/oauth/minted-key-resolver.js";
import {
  UnconfiguredCredentialResolver,
  type CredentialResolver,
} from "../http/oauth/credential-resolver.js";

const PROVISION_URL = "https://api.test/api/v1/mcp/resolve-key";
const SECRET = "prov-secret";
const SUB = "user-uuid-1";

function authFor(sub = SUB, email = "u@example.com"): AuthInfo {
  return {
    token: "eyJ.fake.jwt",
    clientId: "claude",
    scopes: ["sf:read"],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    extra: { sub, email },
  } as AuthInfo;
}

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

/** A fetch stub that records calls and returns a JSON body. */
function stubFetch(
  responder: (
    url: string,
    init: FetchInit,
  ) => { ok: boolean; status: number; body: unknown },
) {
  const calls: Array<{ url: string; init: FetchInit }> = [];
  const fetchImpl = async (url: string, init?: FetchInit) => {
    init = init ?? {};
    calls.push({ url, init });
    const r = responder(url, init);
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  };
  return { fetchImpl, calls };
}

describe("MintedKeyCredentialResolver", () => {
  it("forwards sub/email + secret and returns the minted sf_ key", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({
      ok: true,
      status: 200,
      body: { api_key: "sf_" + "a".repeat(40), tier: "pro", minted: true },
    }));
    const resolver = new MintedKeyCredentialResolver({
      provisionUrl: PROVISION_URL,
      provisionSecret: SECRET,
      fetchImpl,
    });

    const out = await resolver.resolve(authFor());
    assert.equal(out.apiKey, "sf_" + "a".repeat(40));
    assert.equal(out.tier, "pro");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, PROVISION_URL);
    assert.equal(calls[0]!.init.headers!["X-MCP-Provision-Secret"], SECRET);
    const sent = JSON.parse(calls[0]!.init.body!);
    assert.equal(sent.user_id, SUB);
    assert.equal(sent.email, "u@example.com");
  });

  it("never returns the user OAuth token as the credential", async () => {
    const { fetchImpl } = stubFetch(() => ({
      ok: true,
      status: 200,
      body: { api_key: "sf_" + "b".repeat(40), tier: "free" },
    }));
    const resolver = new MintedKeyCredentialResolver({
      provisionUrl: PROVISION_URL,
      provisionSecret: SECRET,
      fetchImpl,
    });
    const auth = authFor();
    const out = await resolver.resolve(auth);
    assert.notEqual(out.apiKey, auth.token);
    assert.ok(out.apiKey!.startsWith("sf_"));
  });

  it("caches per-sub within the TTL, then re-fetches after expiry", async () => {
    let clock = 1_000_000;
    const { fetchImpl, calls } = stubFetch(() => ({
      ok: true,
      status: 200,
      body: { api_key: "sf_" + "c".repeat(40), tier: "free" },
    }));
    const resolver = new MintedKeyCredentialResolver({
      provisionUrl: PROVISION_URL,
      provisionSecret: SECRET,
      cacheTtlMs: 1000,
      fetchImpl,
      now: () => clock,
    });

    await resolver.resolve(authFor());
    await resolver.resolve(authFor()); // within TTL -> cached
    assert.equal(calls.length, 1, "second resolve should hit cache");

    clock += 1001; // expire
    await resolver.resolve(authFor());
    assert.equal(calls.length, 2, "expired entry should re-fetch");
  });

  it("caches separately per distinct sub", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({
      ok: true,
      status: 200,
      body: { api_key: "sf_" + "d".repeat(40), tier: "free" },
    }));
    const resolver = new MintedKeyCredentialResolver({
      provisionUrl: PROVISION_URL,
      provisionSecret: SECRET,
      fetchImpl,
    });
    await resolver.resolve(authFor("sub-A"));
    await resolver.resolve(authFor("sub-B"));
    assert.equal(calls.length, 2);
  });

  it("throws (without leaking the secret) on a non-2xx provisioning response", async () => {
    const { fetchImpl } = stubFetch(() => ({
      ok: false,
      status: 403,
      body: {},
    }));
    const resolver = new MintedKeyCredentialResolver({
      provisionUrl: PROVISION_URL,
      provisionSecret: SECRET,
      fetchImpl,
    });
    await assert.rejects(resolver.resolve(authFor()), (err: Error) => {
      assert.ok(
        !err.message.includes(SECRET),
        "error must not contain the secret",
      );
      assert.match(err.message, /provisioning returned HTTP 403/);
      return true;
    });
  });

  it("throws when the response carries no usable sf_ key", async () => {
    const { fetchImpl } = stubFetch(() => ({
      ok: true,
      status: 200,
      body: { api_key: "not-an-sf-key", tier: "free" },
    }));
    const resolver = new MintedKeyCredentialResolver({
      provisionUrl: PROVISION_URL,
      provisionSecret: SECRET,
      fetchImpl,
    });
    await assert.rejects(resolver.resolve(authFor()), /no usable sf_ key/);
  });

  it("throws when the verified token has no sub", async () => {
    const resolver = new MintedKeyCredentialResolver({
      provisionUrl: PROVISION_URL,
      provisionSecret: SECRET,
      fetchImpl: stubFetch(() => ({ ok: true, status: 200, body: {} }))
        .fetchImpl,
    });
    const noSub = {
      token: "x",
      clientId: "",
      scopes: [],
      extra: {},
    } as AuthInfo;
    await assert.rejects(resolver.resolve(noSub), /no sub/);
  });

  it("constructor throws without a provisioning secret", () => {
    assert.throws(
      () =>
        new MintedKeyCredentialResolver({
          provisionUrl: PROVISION_URL,
          provisionSecret: "",
        }),
      /SF_MCP_PROVISION_SECRET/,
    );
  });
});

describe("createDefaultCredentialResolver", () => {
  it("returns the fail-loud Unconfigured resolver when no secret is set", () => {
    const prev = process.env.SF_MCP_PROVISION_SECRET;
    delete process.env.SF_MCP_PROVISION_SECRET;
    try {
      const r: CredentialResolver = createDefaultCredentialResolver();
      assert.ok(r instanceof UnconfiguredCredentialResolver);
    } finally {
      if (prev !== undefined) process.env.SF_MCP_PROVISION_SECRET = prev;
    }
  });

  it("returns a MintedKeyCredentialResolver when the secret is set", () => {
    const prev = process.env.SF_MCP_PROVISION_SECRET;
    process.env.SF_MCP_PROVISION_SECRET = "configured-secret";
    try {
      const r = createDefaultCredentialResolver();
      assert.ok(r instanceof MintedKeyCredentialResolver);
    } finally {
      if (prev === undefined) delete process.env.SF_MCP_PROVISION_SECRET;
      else process.env.SF_MCP_PROVISION_SECRET = prev;
    }
  });
});
