/**
 * Scholar Feed MCP — remote (Streamable HTTP) entry point.
 *
 * A SECOND surface alongside the stdio package (src/index.ts is unchanged). This
 * is an Express app that speaks the MCP Streamable HTTP transport in STATELESS
 * mode: every POST /mcp builds a fresh McpServer + transport, runs the request
 * inside a per-request credential context (AsyncLocalStorage, see
 * src/http/credentials.ts), and tears everything down when the response closes.
 * GET/DELETE on /mcp return 405 (stateless has no session to resume or delete).
 *
 * This file is NOT part of the npm `bin` build (`tsup src/index.ts`); it is built
 * by the deploy target. Keep all logic framework-light so the Cloudflare Workers
 * port is a thin entry-point swap.
 *
 * CRITICAL: All logging uses console.error() — never console.log(). stdout
 * hygiene is enforced across server runtime files by a test + lint rule.
 */

import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { registerAllTools } from "./tools/index.js";
import { runWithCreds } from "./http/credentials.js";
import { ScholarFeedTokenVerifier } from "./http/oauth/verifier.js";
import {
  mountMetadataRoutes,
  unauthorizedResponse,
} from "./http/oauth/metadata.js";
import {
  UnconfiguredCredentialResolver,
  UNCONFIGURED_RESOLVER_MESSAGE,
  type CredentialResolver,
} from "./http/oauth/credential-resolver.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** Cap inbound JSON bodies. MCP tool-call payloads are small; this guards the
 * public surface against oversized-body abuse without clipping real requests. */
const BODY_LIMIT = "4mb";

/** Returned on a 501 when the resolver throws ANYTHING other than the vetted,
 * secret-free UnconfiguredCredentialResolver message — so an arbitrary (future)
 * resolver error string can never carry a minted sf_ key / act-as-user JWT back
 * to the caller. The full detail is logged to stderr only. */
const GENERIC_BACKEND_PENDING_MESSAGE =
  "OAuth token verified, but this server is not yet configured to complete " +
  "authenticated requests (backend credential model pending). Contact the operator.";

/** MCP transport headers the browser/host must be able to READ off responses.
 * Includes WWW-Authenticate so the eventual OAuth 401 challenge is visible to
 * the client (Agent C / M4 wires the challenge itself). */
const EXPOSED_HEADERS = [
  "Mcp-Session-Id",
  "Last-Event-ID",
  "Mcp-Protocol-Version",
  "WWW-Authenticate",
];

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
 * Exported for unit testing.
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
 * A missing Host (illegal under HTTP/1.1) is rejected. Exported for unit testing.
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
 * Per-process OAuth primitives (M4). The verifier is AS-agnostic: it reads its
 * audience / issuer / JWKS source from env (see verifier.ts). The default
 * CredentialResolver is the fail-loud UnconfiguredCredentialResolver — it THROWS
 * because the backend credential model (open decision #8) is not yet chosen, so
 * an OAuth-authenticated account call surfaces a clear 501 rather than silently
 * doing the wrong thing. Both are overridable via createApp() options so a later
 * milestone (or a test) can inject a working resolver / a test-keyed verifier.
 */
const defaultVerifier: OAuthTokenVerifier = new ScholarFeedTokenVerifier();
const defaultCredentialResolver: CredentialResolver =
  new UnconfiguredCredentialResolver();

/**
 * The outcome of resolving creds for one request. A JWT path can either succeed
 * (creds), fail verification (401 challenge), or verify but have no backend
 * credential model yet (501). The `sf_`-bearer and anonymous paths always
 * succeed (they need no token verification).
 */
type CredResolution =
  | { kind: "ok"; creds: { apiKey: string | null; sessionId: string } }
  | { kind: "unauthorized" }
  | { kind: "not-configured"; message: string };

/**
 * Resolve the per-request credentials from the inbound request.
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
async function resolveRequestCreds(
  req: Request,
  verifier: OAuthTokenVerifier,
  resolver: CredentialResolver,
): Promise<CredResolution> {
  const header = req.header("authorization") ?? "";
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
      console.error("[server-http] OAuth token verification failed:", reason);
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
        "[server-http] credential resolver could not bridge token->key:",
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
  // backend's own 401; truly token-gated paths use unauthorizedResponse().
  return { kind: "ok", creds: { apiKey: null, sessionId: randomUUID() } };
}

/**
 * Handle one stateless POST /mcp. A fresh server + transport per request keeps
 * tenants isolated (no shared in-process state across callers); both are closed
 * when the response finishes.
 */
async function handleMcpPost(
  req: Request,
  res: Response,
  verifier: OAuthTokenVerifier,
  resolver: CredentialResolver,
): Promise<void> {
  // Resolve creds BEFORE building the server so a 401/501 short-circuits without
  // standing up an McpServer + transport for a request we will not serve.
  let resolution: CredResolution;
  try {
    resolution = await resolveRequestCreds(req, verifier, resolver);
  } catch (err) {
    console.error("[server-http] error resolving request creds:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
    return;
  }

  if (resolution.kind === "unauthorized") {
    // Invalid / unverifiable OAuth token: 401 + WWW-Authenticate challenge that
    // points the host at the RFC 9728 protected-resource metadata.
    unauthorizedResponse(res);
    return;
  }

  if (resolution.kind === "not-configured") {
    // Token verified, but no backend credential model yet (open decision #8).
    // 501 Not Implemented is the honest status: the request is well-formed and
    // authenticated, the server just cannot yet bridge it to a backend call.
    res.status(501).json({
      jsonrpc: "2.0",
      error: { code: -32002, message: resolution.message },
      id: null,
    });
    return;
  }

  const server = new McpServer({ name: "scholar-feed", version });
  registerAllTools(server);

  const transport = new StreamableHTTPServerTransport({
    // Stateless: no session id, no session validation, GET/DELETE unsupported.
    sessionIdGenerator: undefined,
  });

  // Tear down per-request resources once the client disconnects / response ends.
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    // Bind the per-request creds for the whole handleRequest -> tool -> client
    // chain via AsyncLocalStorage, then let the transport drive the response.
    await runWithCreds(resolution.creds, () =>
      transport.handleRequest(req, res, req.body),
    );
  } catch (err) {
    console.error("[server-http] error handling POST /mcp:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

/** GET/DELETE /mcp in stateless mode: there is no session to stream or delete. */
function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message:
        "Method Not Allowed: this stateless MCP server only accepts POST",
    },
    id: null,
  });
}

/**
 * createApp options. Both default to the process-level OAuth primitives; a test
 * (or a later milestone) injects a test-keyed verifier and/or a working
 * CredentialResolver without touching the wiring.
 */
export interface CreateAppOptions {
  /** OAuth access-token verifier. Defaults to the env-configured ES256/JWKS one. */
  verifier?: OAuthTokenVerifier;
  /** token->key bridge. Defaults to the fail-loud UnconfiguredCredentialResolver. */
  credentialResolver?: CredentialResolver;
}

/**
 * Build the Express app. Exported (alongside the default `app`) so tests can
 * mount it on an ephemeral port without spawning a process.
 */
export function createApp(opts: CreateAppOptions = {}): express.Express {
  const verifier = opts.verifier ?? defaultVerifier;
  const credentialResolver =
    opts.credentialResolver ?? defaultCredentialResolver;
  const app = express();

  // CORS: expose the MCP transport headers so browser-based hosts can read them.
  // Origin enforcement itself is handled by the explicit guard below (CORS
  // `origin: true` reflects the request origin for the browser; the guard is
  // the actual DNS-rebinding gate).
  app.use(
    cors({
      origin: true,
      exposedHeaders: EXPOSED_HEADERS,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Mcp-Session-Id",
        "Mcp-Protocol-Version",
        "Last-Event-ID",
      ],
      methods: ["POST", "GET", "DELETE", "OPTIONS"],
    }),
  );

  // DNS-rebinding guard (Origin half): reject browser cross-site Origins not on
  // the allowlist.
  app.use((req: Request, res: Response, next) => {
    if (!isOriginAllowed(req.header("origin") ?? undefined)) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Forbidden: origin not allowed" },
        id: null,
      });
      return;
    }
    next();
  });

  // DNS-rebinding guard (Host half): pin the Host header. Origin alone misses
  // rebinding attacks that send no Origin and a Host of the attacker's domain.
  app.use((req: Request, res: Response, next) => {
    if (!isHostAllowed(req.headers.host)) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Forbidden: host not allowed" },
        id: null,
      });
      return;
    }
    next();
  });

  // RFC 9728 protected-resource metadata at the app root. Served at both the
  // bare and /mcp-suffixed well-known paths so a host's discovery probe (which
  // the 401 WWW-Authenticate challenge points at) always resolves. Mounted
  // before the JSON body parser since these are GETs with no body.
  mountMetadataRoutes(app);

  app.use(express.json({ limit: BODY_LIMIT }));

  app.post("/mcp", (req, res) => {
    void handleMcpPost(req, res, verifier, credentialResolver);
  });
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

export const app = createApp();

// Run-directly guard: only listen when this module is the process entry point,
// never when imported by a test. import.meta.url vs argv[1] is the ESM idiom.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  // The remote transport derives EACH request's key from its own Authorization
  // header. A process-level SF_API_KEY is a latent cross-tenant leak: client.ts
  // falls back to it only if a request's ALS credential context is ever lost, so
  // it must simply never be set on the remote server. Fail fast over shipping
  // that footgun.
  if (process.env.SF_API_KEY) {
    console.error(
      "[server-http] FATAL: SF_API_KEY must NOT be set in the remote server's " +
        "environment — each request carries its own key. A process-level key is a " +
        "latent cross-tenant leak. Unset SF_API_KEY and redeploy.",
    );
    process.exit(1);
  }
  if (envAllowlist("SF_MCP_ALLOWED_HOSTS").size === 0) {
    console.error(
      "[server-http] WARNING: SF_MCP_ALLOWED_HOSTS is unset — only loopback Host " +
        "headers are accepted (fine for local dev). Set it to your public host " +
        "(e.g. mcp.scholarfeed.org) or tunnel host before exposing this server.",
    );
  }
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.error(`Scholar Feed MCP (remote/HTTP) listening on :${port}/mcp`);
  });
}
