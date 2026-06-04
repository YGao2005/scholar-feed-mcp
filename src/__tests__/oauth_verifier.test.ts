/**
 * OAuth 2.1 Resource Server unit tests (M4).
 *
 * The verifier is exercised entirely OFFLINE: we generate a local ES256 keypair
 * with jose, sign test tokens with SignJWT, and inject the PUBLIC key into the
 * verifier via the testability seam (`keyResolver`). No network, no real JWKS.
 * The negative cases (expired, wrong aud, HS256, alg=none, missing sub) prove
 * the verifier rejects exactly what backend/api/auth.py rejects.
 *
 * Also covered: the RFC 9728 metadata document shape, the fail-loud
 * UnconfiguredCredentialResolver, and the unauthorizedResponse() challenge.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { generateKeyPair, SignJWT, type CryptoKey } from "jose";

import {
  ScholarFeedTokenVerifier,
  mapPayloadToAuthInfo,
} from "../http/oauth/verifier.js";
import { createApp } from "../server-http.js";
import {
  buildProtectedResourceMetadata,
  unauthorizedResponse,
  protectedResourceMetadataUrl,
  SUPPORTED_SCOPES,
} from "../http/oauth/metadata.js";
import {
  UnconfiguredCredentialResolver,
  UNCONFIGURED_RESOLVER_MESSAGE,
} from "../http/oauth/credential-resolver.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const AUDIENCE = "https://mcp.scholarfeed.org/mcp";
const ISSUER = "https://test-as.example/auth/v1";

/** Generate a fresh ES256 keypair for each test that needs one. */
async function es256(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}> {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  return {
    privateKey: privateKey as CryptoKey,
    publicKey: publicKey as CryptoKey,
  };
}

/** Mint an ES256 JWT with the given claims, signed by `privateKey`. */
async function signEs256(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  opts: { expiresIn?: string; setExp?: boolean } = {},
): Promise<string> {
  let builder = new SignJWT(claims).setProtectedHeader({ alg: "ES256" });
  builder = builder.setIssuedAt();
  if (opts.setExp !== false) {
    builder = builder.setExpirationTime(opts.expiresIn ?? "5m");
  }
  return builder.sign(privateKey);
}

describe("ScholarFeedTokenVerifier (ES256/JWKS, mirrors backend auth.py)", () => {
  it("accepts a valid token and maps the claims to AuthInfo", async () => {
    const { privateKey, publicKey } = await es256();
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: publicKey,
    });

    const token = await signEs256(privateKey, {
      sub: "user-123",
      aud: AUDIENCE,
      iss: ISSUER,
      email: "researcher@example.com",
      azp: "client-abc",
      scope: "sf:read sf:library",
      sf_tier: "pro",
    });

    const auth = await verifier.verifyAccessToken(token);

    assert.strictEqual(auth.token, token);
    assert.strictEqual(auth.clientId, "client-abc");
    assert.deepStrictEqual(auth.scopes, ["sf:read", "sf:library"]);
    assert.strictEqual(typeof auth.expiresAt, "number");
    assert.strictEqual(auth.extra?.sub, "user-123");
    assert.strictEqual(auth.extra?.email, "researcher@example.com");
    assert.strictEqual(auth.extra?.tier, "pro");
  });

  it("falls back azp -> client_id -> '' for clientId, and tier -> '' empty scope", async () => {
    const { privateKey, publicKey } = await es256();
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: publicKey,
    });

    // No azp; client_id present; plain `tier`; no `scope`.
    const token = await signEs256(privateKey, {
      sub: "user-xyz",
      aud: AUDIENCE,
      client_id: "client-from-client_id",
      tier: "free",
    });

    const auth = await verifier.verifyAccessToken(token);
    assert.strictEqual(auth.clientId, "client-from-client_id");
    assert.deepStrictEqual(auth.scopes, []);
    assert.strictEqual(auth.extra?.tier, "free");
  });

  it("rejects an expired token", async () => {
    const { privateKey, publicKey } = await es256();
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: publicKey,
    });

    // exp 60s in the past.
    const token = await new SignJWT({ sub: "user-1", aud: AUDIENCE })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);

    await assert.rejects(() => verifier.verifyAccessToken(token));
  });

  it("rejects a token with the wrong audience", async () => {
    const { privateKey, publicKey } = await es256();
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: publicKey,
    });

    const token = await signEs256(privateKey, {
      sub: "user-1",
      aud: "https://some-other-resource.example/mcp",
    });

    await assert.rejects(() => verifier.verifyAccessToken(token));
  });

  it("rejects an HS256 token (alg-confusion guard)", async () => {
    const { publicKey } = await es256();
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: publicKey,
    });

    // Sign with HS256 using an arbitrary symmetric secret. Even if an attacker
    // tried to use the (public) verification key as an HMAC secret, the
    // algorithms allowlist (["ES256"]) rejects it before any signature check.
    const secret = new TextEncoder().encode(
      "a-very-long-symmetric-secret-value-padding-padding",
    );
    const token = await new SignJWT({ sub: "user-1", aud: AUDIENCE })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);

    await assert.rejects(() => verifier.verifyAccessToken(token));
  });

  it("rejects an unsigned (alg=none) token", async () => {
    const { publicKey } = await es256();
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: publicKey,
    });

    // Hand-craft an alg=none compact JWT: header.payload. (no signature).
    const b64 = (obj: unknown): string =>
      Buffer.from(JSON.stringify(obj)).toString("base64url");
    const header = b64({ alg: "none", typ: "JWT" });
    const payload = b64({
      sub: "user-1",
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const noneToken = `${header}.${payload}.`;

    await assert.rejects(() => verifier.verifyAccessToken(noneToken));
  });

  it("rejects a token missing the sub claim", async () => {
    const { privateKey, publicKey } = await es256();
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: publicKey,
    });

    // Valid signature + aud + exp, but no sub.
    const token = await signEs256(privateKey, { aud: AUDIENCE });

    await assert.rejects(() => verifier.verifyAccessToken(token));
  });

  it("rejects a token signed by a DIFFERENT key (bad signature)", async () => {
    const signer = await es256();
    const other = await es256();
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: other.publicKey, // verify with the WRONG public key
    });

    const token = await signEs256(signer.privateKey, {
      sub: "user-1",
      aud: AUDIENCE,
    });

    await assert.rejects(() => verifier.verifyAccessToken(token));
  });

  it("enforces issuer only when enforceIssuer is true", async () => {
    const { privateKey, publicKey } = await es256();

    // Token has the WRONG issuer.
    const token = await signEs256(privateKey, {
      sub: "user-1",
      aud: AUDIENCE,
      iss: "https://attacker.example/auth/v1",
    });

    // enforceIssuer off -> accepted despite the wrong iss.
    const lenient = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: publicKey,
      enforceIssuer: false,
    });
    await assert.doesNotReject(() => lenient.verifyAccessToken(token));

    // enforceIssuer on with the expected iss -> rejected.
    const strict = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      issuer: ISSUER,
      enforceIssuer: true,
      keyResolver: publicKey,
    });
    await assert.rejects(() => strict.verifyAccessToken(token));

    // ...and accepted when the iss matches.
    const goodIssToken = await signEs256(privateKey, {
      sub: "user-1",
      aud: AUDIENCE,
      iss: ISSUER,
    });
    await assert.doesNotReject(() => strict.verifyAccessToken(goodIssToken));
  });

  it("throws on construction when the audience is empty (fail closed, no silent bypass)", async () => {
    const { publicKey } = await es256();
    // Explicit empty audience.
    assert.throws(
      () =>
        new ScholarFeedTokenVerifier({ audience: "", keyResolver: publicKey }),
      /audience is empty/,
    );
    assert.throws(
      () =>
        new ScholarFeedTokenVerifier({
          audience: "   ",
          keyResolver: publicKey,
        }),
      /audience is empty/,
    );
    // Empty via env (the "export SF_MCP_AUDIENCE=" footgun): `??` would pass "".
    const prev = process.env.SF_MCP_AUDIENCE;
    process.env.SF_MCP_AUDIENCE = "";
    try {
      assert.throws(
        () => new ScholarFeedTokenVerifier({ keyResolver: publicKey }),
        /audience is empty/,
      );
    } finally {
      if (prev === undefined) delete process.env.SF_MCP_AUDIENCE;
      else process.env.SF_MCP_AUDIENCE = prev;
    }
  });
});

describe("mapPayloadToAuthInfo", () => {
  it("throws when sub is absent or empty", () => {
    assert.throws(() => mapPayloadToAuthInfo("tok", { aud: AUDIENCE }));
    assert.throws(() =>
      mapPayloadToAuthInfo("tok", { sub: "", aud: AUDIENCE }),
    );
  });
});

describe("RFC 9728 protected-resource metadata", () => {
  it("has the expected shape and scopes", () => {
    const doc = buildProtectedResourceMetadata();
    assert.strictEqual(doc.resource, AUDIENCE);
    assert.deepStrictEqual(doc.scopes_supported, [...SUPPORTED_SCOPES]);
    assert.deepStrictEqual(doc.bearer_methods_supported, ["header"]);
    assert.deepStrictEqual(SUPPORTED_SCOPES, [
      "sf:read",
      "sf:library",
      "sf:collections",
      "sf:watches",
      "sf:pro",
    ]);
  });
});

describe("UnconfiguredCredentialResolver", () => {
  it("throws the documented open-decision-#8 message", async () => {
    const resolver = new UnconfiguredCredentialResolver();
    const fakeAuth: AuthInfo = {
      token: "tok",
      clientId: "c",
      scopes: ["sf:read"],
      extra: { sub: "user-1" },
    };
    await assert.rejects(
      () => resolver.resolve(fakeAuth),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, UNCONFIGURED_RESOLVER_MESSAGE);
        // Spot-check the message documents the unrecoverable-hash reality + #8.
        assert.match(err.message, /SHA-256 hashes/);
        assert.match(err.message, /open decision #8/);
        return true;
      },
    );
  });
});

describe("server-http OAuth wiring (createApp, over the wire)", () => {
  // A test-keyed verifier (local ES256 public key injected) + the DEFAULT
  // fail-loud resolver, mounted on a real ephemeral listener. Proves the JWT
  // path verifies, never forwards the user token, and surfaces 501 (resolver
  // unconfigured) / 401 (bad token) exactly as the milestone requires.
  let server: Server;
  let baseUrl: string;
  let privateKey: CryptoKey;

  before(async () => {
    const kp = await es256();
    privateKey = kp.privateKey;
    const verifier = new ScholarFeedTokenVerifier({
      audience: AUDIENCE,
      keyResolver: kp.publicKey,
    });
    const app = createApp({ verifier });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const MCP_ACCEPT = "application/json, text/event-stream";
  const PROTOCOL_VERSION = "2025-11-25";

  function toolCall(name: string) {
    return {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "tools/call",
      params: { name, arguments: {} },
    };
  }

  async function postMcp(
    auth: string | undefined,
    payload: unknown,
  ): Promise<{ status: number; wwwAuth: string | null; text: string }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: MCP_ACCEPT,
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (auth) headers.Authorization = auth;
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return {
      status: res.status,
      wwwAuth: res.headers.get("www-authenticate"),
      text: await res.text(),
    };
  }

  it("serves RFC 9728 metadata at the well-known path", async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    assert.strictEqual(res.status, 200);
    const doc = (await res.json()) as {
      resource: string;
      scopes_supported: string[];
      bearer_methods_supported: string[];
    };
    assert.strictEqual(doc.resource, AUDIENCE);
    assert.deepStrictEqual(doc.bearer_methods_supported, ["header"]);
    assert.ok(doc.scopes_supported.includes("sf:read"));
  });

  it("also serves metadata at the /mcp-suffixed well-known path", async () => {
    const res = await fetch(
      `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
    );
    assert.strictEqual(res.status, 200);
  });

  it("returns 401 + WWW-Authenticate for an invalid JWT bearer", async () => {
    const { status, wwwAuth } = await postMcp(
      "Bearer eyJhbGciOiJFUzI1NiJ9.bogus.signature",
      toolCall("save_paper"),
    );
    assert.strictEqual(status, 401);
    assert.ok(wwwAuth, "WWW-Authenticate header must be present on 401");
    assert.match(wwwAuth, /^Bearer /);
    assert.match(wwwAuth, /resource_metadata="/);
    assert.match(wwwAuth, /scope="sf:read"/);
  });

  it("returns 501 for a VALID JWT (verified, but backend credential model pending #8)", async () => {
    const token = await signEs256(privateKey, {
      sub: "user-1",
      aud: AUDIENCE,
      scope: "sf:read sf:library",
    });
    const { status, text } = await postMcp(
      `Bearer ${token}`,
      toolCall("save_paper"),
    );
    assert.strictEqual(status, 501);
    // The honest message documents the open decision, not a generic 500.
    assert.match(text, /open decision #8/);
    // And it MUST NOT leak the verified user's JWT back to the caller.
    assert.ok(
      !text.includes(token),
      "501 body must not echo the user's OAuth token",
    );
  });

  it("preserves the anonymous path: no token -> tool runs (backend handles caps)", async () => {
    // tools/list needs no backend call and no token; it must still succeed,
    // proving the OAuth wiring did not break the anonymous/read surface.
    const { status } = await postMcp(undefined, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    assert.strictEqual(status, 200);
  });

  it("preserves the sf_ bearer path: an sf_ key is NOT treated as a JWT", async () => {
    // An sf_ key must take the passthrough path (not the verifier). tools/list
    // succeeds without any 401/501 from the OAuth layer.
    const { status } = await postMcp("Bearer sf_test_fake_key_value", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    });
    assert.strictEqual(status, 200);
  });
});

describe("unauthorizedResponse()", () => {
  it("sets WWW-Authenticate with resource_metadata and emits 401", () => {
    const headers: Record<string, string> = {};
    let statusCode = 0;
    let jsonBody: unknown;
    // Minimal Express Response double.
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        jsonBody = body;
        return this;
      },
    };

    unauthorizedResponse(
      res as unknown as Parameters<typeof unauthorizedResponse>[0],
    );

    assert.strictEqual(statusCode, 401);
    const challenge = headers["WWW-Authenticate"];
    assert.ok(challenge, "WWW-Authenticate header must be set");
    assert.match(challenge, /^Bearer /);
    assert.ok(
      challenge.includes(
        `resource_metadata="${protectedResourceMetadataUrl()}"`,
      ),
      `challenge must carry resource_metadata: ${challenge}`,
    );
    assert.match(challenge, /scope="sf:read"/);
    const body = jsonBody as { error?: { code?: number } };
    assert.strictEqual(body.error?.code, -32001);
  });
});
