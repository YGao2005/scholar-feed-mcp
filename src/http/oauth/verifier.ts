/**
 * OAuth 2.1 Resource Server token verifier (ES256 / JWKS).
 *
 * This is the security core of the remote MCP server. It implements the MCP SDK
 * `OAuthTokenVerifier` interface (`verifyAccessToken(token): Promise<AuthInfo>`)
 * by validating a Supabase-issued access token the same way the production
 * backend does (scholar-feed/backend/api/auth.py `decode_supabase_jwt`):
 *
 *   - ES256 ONLY. The algorithm allowlist is LOCKED to ["ES256"]. jose checks
 *     the JWS `alg` against this list BEFORE any signature verification, so a
 *     token claiming `none`, `HS256`, or `RS256` is rejected outright. This is
 *     the alg-confusion guard: an asymmetric verifier that also accepted HS256
 *     could be tricked into verifying an attacker-forged token against the
 *     PUBLIC key used as an HMAC secret.
 *   - Signature verified against the AS JWKS (Supabase
 *     `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`) via createRemoteJWKSet,
 *     which caches keys and handles rotation.
 *   - `aud` MUST equal the MCP resource URI (NOT Supabase's default
 *     `authenticated`). jose enforces this when `audience` is passed. The
 *     Custom Access Token Hook that stamps this `aud` is backend work and OUT
 *     OF SCOPE here; the target is read from env so the AS can be swapped
 *     (Supabase -> WorkOS/Auth0) by config alone.
 *   - `exp` enforced by jose (a token with no `exp` or a past `exp` is
 *     rejected).
 *   - `sub` REQUIRED and explicitly re-checked (defense in depth; jose does not
 *     require `sub` on its own).
 *   - `iss` enforced ONLY when SF_OAUTH_ENFORCE_ISSUER is truthy, mirroring the
 *     backend's gated `enforce_jwt_issuer`. An incorrect expected issuer would
 *     401 every real token, and the exact value cannot be confirmed against a
 *     live token from here, so enforcement is opt-in.
 *
 * On any validation failure this THROWS; the bearer-auth layer maps the throw
 * to a 401 + WWW-Authenticate challenge. It never returns a partially-validated
 * AuthInfo.
 *
 * TESTABILITY SEAM: the constructor accepts an optional `keyResolver` — a jose
 * key (CryptoKey/KeyObject/JWK/Uint8Array) or a JWTVerifyGetKey function. When
 * provided it is used verbatim instead of createRemoteJWKSet, so unit tests
 * verify tokens signed by a locally-generated ES256 keypair with NO network.
 * Production omits it and the remote JWKS is built lazily from `jwksUrl`.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
  type CryptoKey,
  type KeyObject,
  type JWK,
} from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";

/** The only signature algorithm we trust. LOCKED — see file header. */
const ALLOWED_ALGORITHMS = ["ES256"] as const;

/** The MCP resource URI the token `aud` must equal (default canonical URI). */
const DEFAULT_AUDIENCE = "https://mcp.scholarfeed.org/mcp";

/**
 * A key the verifier can hand to jose's `jwtVerify`. This is exactly the union
 * `jwtVerify` accepts: a static key (CryptoKey/KeyObject/JWK/Uint8Array) for the
 * single-overload, or a JWTVerifyGetKey resolver (what createRemoteJWKSet
 * returns) for the dynamic overload.
 */
export type KeyResolver =
  | CryptoKey
  | KeyObject
  | JWK
  | Uint8Array
  | JWTVerifyGetKey;

/** Construction-time options. All optional; production reads from env. */
export interface VerifierOptions {
  /**
   * The expected token `aud`. Defaults to SF_MCP_AUDIENCE, then the canonical
   * MCP resource URI.
   */
  audience?: string;
  /**
   * The expected `iss`. Only enforced when `enforceIssuer` is true.
   * Defaults to SF_OAUTH_ISSUER.
   */
  issuer?: string;
  /**
   * Whether to enforce the `iss` claim. Defaults to the truthiness of
   * SF_OAUTH_ENFORCE_ISSUER (mirrors the backend's `enforce_jwt_issuer` gate).
   */
  enforceIssuer?: boolean;
  /**
   * The JWKS URL to fetch signing keys from. Defaults to SF_OAUTH_JWKS_URL,
   * then `{SF_OAUTH_ISSUER}/.well-known/jwks.json`. For Supabase the form is
   * `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
   */
  jwksUrl?: string;
  /**
   * TESTABILITY SEAM. An injected jose key or JWTVerifyGetKey. When set, this is
   * used to verify signatures instead of building a remote JWKS, so tests can
   * sign with a local ES256 keypair and verify with its public key offline.
   */
  keyResolver?: KeyResolver;
}

/**
 * Read SF_OAUTH_ENFORCE_ISSUER as a boolean. Truthy = the literal "1", "true",
 * "yes", "on" (case-insensitive); everything else (including unset) is false.
 * This mirrors the backend treating it as an off-by-default gate.
 */
function envIssuerEnforced(): boolean {
  const raw = (process.env.SF_OAUTH_ENFORCE_ISSUER ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Compute the default JWKS URL from the issuer when no explicit URL is set.
 * Standard RFC 8414 path is `{issuer}/.well-known/jwks.json`. (Supabase serves
 * its keys at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`; set
 * SF_OAUTH_JWKS_URL or an issuer of `{SUPABASE_URL}/auth/v1` to match.)
 */
function jwksUrlFromIssuer(issuer: string | undefined): string | undefined {
  if (!issuer) return undefined;
  // Trim any trailing slash so we don't emit a doubled `//.well-known`.
  const base = issuer.replace(/\/+$/, "");
  return `${base}/.well-known/jwks.json`;
}

/**
 * The ES256/JWKS access-token verifier. Implements the SDK `OAuthTokenVerifier`
 * so it drops straight into `requireBearerAuth({ verifier })`.
 */
export class ScholarFeedTokenVerifier implements OAuthTokenVerifier {
  private readonly audience: string;
  private readonly issuer: string | undefined;
  private readonly enforceIssuer: boolean;
  private readonly jwksUrl: string | undefined;
  /** Either the injected resolver or a lazily-built remote JWKS. */
  private readonly injectedResolver: KeyResolver | undefined;
  private remoteJwks: JWTVerifyGetKey | undefined;

  constructor(opts: VerifierOptions = {}) {
    // Audience: trim and REQUIRE non-empty. `??` only falls through on
    // null/undefined, so an empty-string SF_MCP_AUDIENCE ("export SF_MCP_AUDIENCE="
    // or a blank templated value) would slip through as "" — and jose treats a
    // falsy `audience` as "skip the check", silently disabling audience binding
    // and accepting ANY signed token issued for this resource. Fail closed.
    const audience = (
      opts.audience ??
      process.env.SF_MCP_AUDIENCE ??
      DEFAULT_AUDIENCE
    ).trim();
    if (!audience) {
      throw new Error(
        "OAuth verifier misconfigured: audience is empty. Set SF_MCP_AUDIENCE to " +
          "the MCP resource URI (e.g. https://mcp.scholarfeed.org/mcp). An empty " +
          "audience would disable audience validation entirely (jose treats a " +
          "falsy audience as 'skip'), accepting any signed token for this resource.",
      );
    }
    this.audience = audience;
    this.issuer = opts.issuer ?? process.env.SF_OAUTH_ISSUER;
    this.enforceIssuer = opts.enforceIssuer ?? envIssuerEnforced();
    this.jwksUrl =
      opts.jwksUrl ??
      process.env.SF_OAUTH_JWKS_URL ??
      jwksUrlFromIssuer(this.issuer);
    this.injectedResolver = opts.keyResolver;
  }

  /**
   * Resolve the key argument for jose. Prefers the injected resolver (tests);
   * otherwise builds (once, lazily) a remote JWKS from `jwksUrl`. Constructing
   * the remote JWKS performs no network I/O — keys are fetched on first verify
   * and cached — so this is safe to defer to the first request.
   */
  private resolveKey(): KeyResolver {
    if (this.injectedResolver !== undefined) return this.injectedResolver;
    if (this.remoteJwks === undefined) {
      if (!this.jwksUrl) {
        throw new Error(
          "OAuth verifier misconfigured: no JWKS source. Set SF_OAUTH_JWKS_URL " +
            "(e.g. {SUPABASE_URL}/auth/v1/.well-known/jwks.json) or SF_OAUTH_ISSUER, " +
            "or inject a keyResolver for tests.",
        );
      }
      this.remoteJwks = createRemoteJWKSet(new URL(this.jwksUrl));
      if (!this.enforceIssuer) {
        // Production-only warning (the injected-resolver test path never reaches
        // here). With issuer enforcement off, a token from a DIFFERENT issuer is
        // still rejected today by the JWKS signature + audience checks — but once
        // the access-token hook stamps the shared MCP `aud`, the issuer becomes
        // the only project discriminator left to enable.
        console.error(
          "[oauth] WARNING: issuer enforcement is OFF (SF_OAUTH_ENFORCE_ISSUER " +
            "unset) while verifying against a live JWKS. Token-to-resource binding " +
            "then rests only on the JWKS signature + audience. Before opening OAuth " +
            "to real tokens set SF_OAUTH_ENFORCE_ISSUER=true and SF_OAUTH_ISSUER " +
            "(see docs/plans/2026-06-04-remote-mcp-DECISIONS.md).",
        );
      }
    }
    return this.remoteJwks;
  }

  /**
   * Verify an access token and map it to the SDK `AuthInfo`. Throws on any
   * validation failure (bad signature, wrong/none alg, expired, wrong aud,
   * missing sub, wrong iss when enforced).
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const key = this.resolveKey();

    const options: Parameters<typeof jwtVerify>[2] = {
      algorithms: [...ALLOWED_ALGORITHMS],
      audience: this.audience,
      // exp is enforced by default; require it to be present so a token without
      // an expiry cannot live forever (backend requires exp/sub/aud).
      requiredClaims: ["exp", "sub", "aud"],
    };
    if (this.enforceIssuer) {
      if (!this.issuer) {
        throw new Error(
          "OAuth verifier misconfigured: SF_OAUTH_ENFORCE_ISSUER is set but " +
            "SF_OAUTH_ISSUER is empty.",
        );
      }
      options.issuer = this.issuer;
    }

    // jose verifies: JWS format, alg in the allowlist, signature against the
    // key, exp not in the past, aud == this.audience, iss == this.issuer (when
    // enforced), and the requiredClaims are present. Any failure throws.
    // The two-arg overloads differ only in the key vs getKey type; cast keeps a
    // single call site without re-implementing jose's overload resolution.
    const { payload } = await jwtVerify(token, key as JWTVerifyGetKey, options);

    return mapPayloadToAuthInfo(token, payload);
  }
}

/**
 * Map a verified JWT payload to the SDK `AuthInfo`. Exported for direct unit
 * testing of the claim mapping. Re-checks `sub` (defense in depth) even though
 * `requiredClaims` already enforces presence.
 */
export function mapPayloadToAuthInfo(
  token: string,
  payload: JWTPayload,
): AuthInfo {
  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Token is missing the required `sub` claim.");
  }

  // azp (authorized party) is the OAuth client; fall back to client_id, then "".
  const azp = typeof payload.azp === "string" ? payload.azp : undefined;
  const clientIdClaim =
    typeof payload.client_id === "string" ? payload.client_id : undefined;
  const clientId = azp ?? clientIdClaim ?? "";

  // Space-delimited `scope` string -> array, dropping empties.
  const scopeClaim = typeof payload.scope === "string" ? payload.scope : "";
  const scopes = scopeClaim.split(" ").filter(Boolean);

  const email = typeof payload.email === "string" ? payload.email : undefined;
  // The Custom Access Token Hook (backend) stamps the tier as `sf_tier`; accept
  // a plain `tier` as a fallback. Left undefined when neither is present.
  const tier =
    typeof payload.sf_tier === "string"
      ? payload.sf_tier
      : typeof payload.tier === "string"
        ? payload.tier
        : undefined;

  return {
    token,
    clientId,
    scopes,
    expiresAt: payload.exp,
    extra: { sub, email, tier },
  };
}
