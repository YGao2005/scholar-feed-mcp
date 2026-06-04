/**
 * Framework-neutral credential resolution + DNS-rebinding guards for the remote
 * MCP surface.
 *
 * Both remote entry points share this module:
 *   - src/server-http.ts (Express / Node), and
 *   - src/worker.ts       (Cloudflare Workers / Web Standard fetch).
 *
 * Nothing here touches Express `Request`/`Response` or the Workers `Request`:
 * the caller passes the raw Authorization header string and the raw Origin/Host
 * header values, and gets back a transport-agnostic decision (CredResolution) or
 * a boolean. Each entry point then maps that decision onto its own response type.
 * Keeping the security-critical decision in ONE place is the point — the Express
 * and Workers paths must make the identical sf_/anonymous/JWT/401/501 call.
 *
 * CRITICAL: All logging uses console.error() — never console.log(). stdout
 * hygiene is enforced across server runtime files by a test + lint rule.
 */

import { randomUUID } from "node:crypto";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  UNCONFIGURED_RESOLVER_MESSAGE,
  type CredentialResolver,
} from "./oauth/credential-resolver.js";

/**
 * Returned on a 501 when the resolver throws ANYTHING other than the vetted,
 * secret-free UnconfiguredCredentialResolver message — so an arbitrary (future)
 * resolver error string can never carry a minted sf_ key / act-as-user JWT back
 * to the caller. The full detail is logged to stderr only.
 */
export const GENERIC_BACKEND_PENDING_MESSAGE =
  "OAuth token verified, but this server is not yet configured to complete " +
  "authenticated requests (backend credential model pending). Contact the operator.";

/**
 * The outcome of resolving creds for one request. A JWT path can either succeed
 * (creds), fail verification (401 challenge), or verify but have no backend
 * credential model yet (501). The `sf_`-bearer and anonymous paths always
 * succeed (they need no token verification).
 */
export type CredResolution =
  | { kind: "ok"; creds: { apiKey: string | null; sessionId: string } }
  | { kind: "unauthorized" }
  | { kind: "not-configured"; message: string };

/**
 * Resolve the per-request credentials from the inbound Authorization header.
 *
 * Three Authorization shapes, preserving the M1 behavior for the first two:
 *   - `Bearer sf_...`  : the caller supplies their OWN downstream Scholar Feed
 *     key — the SAME credential the stdio package uses — so we forward it
 *     verbatim. This is NOT confused-deputy passthrough; it is the user handing
 *     us the key meant for api.scholarfeed.org.
 *   - no token         : anonymous (apiKey null); the backend serves it with
 *     lower caps. Account tools then surface the backend's own 401.
 *   - `Bearer eyJ...`  : an OAuth JWT (M4). Verify it (ES256/JWKS, aud ==
 *     SF_MCP_RESOURCE_URI, exp, sub) via the verifier, then call the
 *     CredentialResolver to obtain a DOWNSTREAM backend credential. The user's
 *     JWT is NEVER set as the backend creds (token passthrough is forbidden).
 *     - verify fails  -> { unauthorized } (caller emits 401 + WWW-Authenticate)
 *     - resolver throws (the default Unconfigured one always does) ->
 *       { not-configured } (caller emits 501): EXPECTED until the backend
 *       chooses a credential model (open decision #8).
 *
 * A fresh sessionId is generated per request (stateless: no session continuity).
 */
export async function resolveRequestCreds(
  authHeader: string | undefined,
  verifier: OAuthTokenVerifier,
  resolver: CredentialResolver,
): Promise<CredResolution> {
  const header = authHeader ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();

  // sf_ key: forward it verbatim (M1 path, unchanged).
  if (token && token.startsWith("sf_")) {
    return {
      kind: "ok",
      creds: { apiKey: token, sessionId: randomUUID() },
    };
  }

  // OAuth JWT bearer: verify, then bridge to a downstream credential (M4).
  if (token) {
    let auth;
    try {
      auth = await verifier.verifyAccessToken(token);
    } catch (err) {
      // Bad signature, wrong/none alg, expired, wrong aud, missing sub, etc.
      // Log ONLY a redacted reason: jose's JWTClaimValidationFailed / JWTExpired
      // errors carry a `.payload` of the (signature-UNVERIFIED) claims — which for
      // Supabase tokens includes email/sub/tier — and may carry `.token`. Dumping
      // the whole err would spill that decoded PII into the logs for every
      // rejected token; the name/code is enough to diagnose.
      const reason =
        err instanceof Error
          ? ((err as { code?: string }).code ?? err.name)
          : "unknown";
      console.error("[resolve-creds] OAuth token verification failed:", reason);
      return { kind: "unauthorized" };
    }

    try {
      const resolved = await resolver.resolve(auth);
      // The resolver may hand back extra backend headers for credential models
      // (b)/(c). RequestCreds cannot forward them yet (only apiKey is plumbed), so
      // a resolver that returns headers must FAIL LOUD rather than have them
      // silently dropped — a silent drop would ship a half-wired, possibly
      // confused-deputy model. (Caught below -> generic 501 + stderr detail.)
      if (resolved.headers && Object.keys(resolved.headers).length > 0) {
        throw new Error(
          "CredentialResolver returned headers, but the per-request creds cannot " +
            "forward them to the backend yet (only apiKey is plumbed). Extend " +
            "RequestCreds + client.ts before using a header-bearing credential " +
            "model (#8 model b/c).",
        );
      }
      // NEVER set the user JWT as the backend credential. We forward only the
      // resolver's chosen downstream creds (an sf_ key, or null). The user's
      // OAuth token does not leave this server.
      return {
        kind: "ok",
        creds: { apiKey: resolved.apiKey, sessionId: randomUUID() },
      };
    } catch (err) {
      // The default resolver always throws (backend model pending, #8). Log the
      // full detail to stderr, but only ECHO the vetted, secret-free Unconfigured
      // message back to the client. Any OTHER resolver throw (a future key-minting
      // resolver, or the headers guard above) gets a GENERIC 501 — its raw message
      // could embed a freshly minted sf_ key or act-as-user JWT, which must never
      // reach the caller.
      const detail = err instanceof Error ? err.message : String(err);
      console.error(
        "[resolve-creds] credential resolver could not bridge token->key:",
        detail,
      );
      const message =
        detail === UNCONFIGURED_RESOLVER_MESSAGE
          ? UNCONFIGURED_RESOLVER_MESSAGE
          : GENERIC_BACKEND_PENDING_MESSAGE;
      return { kind: "not-configured", message };
    }
  }

  // No token -> anonymous (M1 path, unchanged). Account tools surface the
  // backend's own 401; truly token-gated paths use the 401 challenge.
  return { kind: "ok", creds: { apiKey: null, sessionId: randomUUID() } };
}

/** Strip IPv6 brackets + lowercase so `new URL(...).hostname` ("[::1]") compares
 * cleanly to "::1". `new URL("http://[::1]:3000").hostname` is the BRACKETED form. */
function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

/** Loopback hostnames we always trust (local dev). */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(normalizeHostname(hostname));
}

/**
 * Parse a comma-separated env allowlist into a trimmed, lowercased Set.
 * Read at call time (not import) so tests/deploys can set it per-process.
 */
function envAllowlist(name: string): Set<string> {
  const raw = process.env[name] ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

/**
 * Origin half of the DNS-rebinding guard. The Origin header is the browser-set
 * signal. Policy:
 *   - No Origin header (native MCP clients, server-to-server) -> allow.
 *   - localhost / 127.0.0.1 / [::1] (any scheme/port) -> allow by default.
 *   - Anything in the SF_MCP_ALLOWED_ORIGINS allowlist -> allow.
 *   - Else -> reject (the caller returns 403).
 * Pure string fn — exported for unit testing and shared by both entry points.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (origin === undefined) return true; // no Origin: not a browser cross-site request
  if (envAllowlist("SF_MCP_ALLOWED_ORIGINS").has(origin.toLowerCase())) {
    return true;
  }
  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return false; // unparseable Origin -> untrusted
  }
}

/**
 * Host half of the DNS-rebinding guard. Origin alone is insufficient: a classic
 * rebinding attack pivots on the Host header (the victim browser still believes
 * it is talking to evil.com, so it sends `Host: evil.com`) and may carry NO
 * Origin — which the Origin guard allows. We therefore also pin the Host:
 *   - Loopback host (localhost / 127.0.0.1 / [::1], any port) -> allow (dev).
 *   - Host in SF_MCP_ALLOWED_HOSTS -> allow (set this to mcp.scholarfeed.org, or
 *     the tunnel host, on any non-loopback deploy).
 *   - Else -> reject. With NO allowlist configured, ONLY loopback is accepted
 *     (fail closed): an unconfigured public deploy rejects everything until the
 *     operator pins its host — which is also exactly the rebinding shape.
 * A missing Host (illegal under HTTP/1.1) is rejected. Pure string fn — exported
 * for unit testing and shared by both entry points.
 */
export function isHostAllowed(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  // Derive the bare hostname (strip :port and IPv6 brackets) robustly.
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    hostname = hostHeader;
  }
  if (isLoopbackHostname(hostname)) return true;
  const allow = envAllowlist("SF_MCP_ALLOWED_HOSTS");
  if (allow.size === 0) return false; // unconfigured: loopback only
  return (
    allow.has(hostHeader.toLowerCase()) ||
    allow.has(normalizeHostname(hostname))
  );
}

/**
 * True when the SF_MCP_ALLOWED_HOSTS allowlist is empty (loopback-only). Used by
 * the entry points to emit the "public deploy needs a host pinned" warning.
 */
export function isHostAllowlistEmpty(): boolean {
  return envAllowlist("SF_MCP_ALLOWED_HOSTS").size === 0;
}
