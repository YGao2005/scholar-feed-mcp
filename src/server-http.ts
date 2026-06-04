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
import express, { type Request, type Response } from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { registerAllTools } from "./tools/index.js";
import {
  buildServerInfo,
  BRAND_FAVICON_URL,
  landingPageHtml,
} from "./server-info.js";
import { runWithCreds } from "./http/credentials.js";
import { ScholarFeedTokenVerifier } from "./http/oauth/verifier.js";
import {
  mountMetadataRoutes,
  unauthorizedResponse,
} from "./http/oauth/metadata.js";
import {
  UnconfiguredCredentialResolver,
  type CredentialResolver,
} from "./http/oauth/credential-resolver.js";
import {
  resolveRequestCreds,
  isOriginAllowed,
  isHostAllowed,
  isHostAllowlistEmpty,
  type CredResolution,
} from "./http/resolve-creds.js";

// Re-export the pure DNS-rebinding guards so existing tests that import them
// from this module keep resolving (the canonical home is now resolve-creds.ts,
// shared with the Cloudflare Workers entry point in worker.ts).
export { isOriginAllowed, isHostAllowed };

/**
 * Package version for serverInfo. Read via createRequire so the long-lived Node
 * process + tests advertise the real version. Wrapped in try/catch because some
 * deploy bundlers (e.g. Vercel's file tracer) cannot resolve the relative
 * require at runtime — fall back to an env override, then a placeholder, rather
 * than crashing module load (which would 500 every request on serverless).
 */
function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    return (require("../package.json") as { version: string }).version;
  } catch {
    return process.env.SF_SERVER_VERSION ?? "0.0.0";
  }
}
const version = readVersion();

/** Cap inbound JSON bodies. MCP tool-call payloads are small; this guards the
 * public surface against oversized-body abuse without clipping real requests. */
const BODY_LIMIT = "4mb";

/** MCP transport headers the browser/host must be able to READ off responses.
 * Includes WWW-Authenticate so the eventual OAuth 401 challenge is visible to
 * the client (Agent C / M4 wires the challenge itself). */
const EXPOSED_HEADERS = [
  "Mcp-Session-Id",
  "Last-Event-ID",
  "Mcp-Protocol-Version",
  "WWW-Authenticate",
];

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
 * Handle one stateless POST /mcp. A fresh server + transport per request keeps
 * tenants isolated (no shared in-process state across callers); both are closed
 * when the response finishes.
 *
 * The sf_/anonymous/JWT/401/501 decision itself lives in the framework-neutral
 * resolveRequestCreds (src/http/resolve-creds.ts), shared verbatim with the
 * Cloudflare Workers entry point (src/worker.ts); here we only pass the raw
 * Authorization header in and map the decision onto the Express response.
 */
async function handleMcpPost(
  req: Request,
  res: Response,
  verifier: OAuthTokenVerifier,
  resolver: CredentialResolver,
  enableJsonResponse: boolean,
): Promise<void> {
  // Resolve creds BEFORE building the server so a 401/501 short-circuits without
  // standing up an McpServer + transport for a request we will not serve.
  let resolution: CredResolution;
  try {
    resolution = await resolveRequestCreds(
      req.header("authorization") ?? undefined,
      verifier,
      resolver,
    );
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

  const server = new McpServer(buildServerInfo(version));
  registerAllTools(server);

  const transport = new StreamableHTTPServerTransport({
    // Stateless: no session id, no session validation, GET/DELETE unsupported.
    sessionIdGenerator: undefined,
    // On serverless (Vercel) there is no long-lived res.on("close") lifecycle and
    // this stateless server has no server->client push, so buffering each
    // request's JSON-RPC replies into one application/json response is lossless
    // and avoids SSE-teardown truncation (the same choice worker.ts makes). The
    // long-lived Node process leaves this false (SSE) by default.
    enableJsonResponse,
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
  /**
   * Buffer each request's JSON-RPC replies into ONE application/json response
   * instead of streaming over SSE. Recommended on serverless (no res.on("close")
   * lifecycle); the stateless server has no server->client push, so JSON mode is
   * lossless. Defaults to false (SSE) for the long-lived Node process + tests.
   */
  enableJsonResponse?: boolean;
}

/**
 * Build the Express app. Exported (alongside the default `app`) so tests can
 * mount it on an ephemeral port without spawning a process.
 */
export function createApp(opts: CreateAppOptions = {}): express.Express {
  const verifier = opts.verifier ?? defaultVerifier;
  const credentialResolver =
    opts.credentialResolver ?? defaultCredentialResolver;
  const enableJsonResponse = opts.enableJsonResponse ?? false;
  const app = express();

  // Public branding endpoints, mounted BEFORE the CORS + DNS-rebinding guards
  // because they carry NO MCP data — just a public logo + a human landing page.
  // A host like claude.ai renders the connector icon from the ORIGIN's favicon;
  // with these unrouted, the bare MCP origin falls back to the hosting platform's
  // logo (e.g. Vercel's). The favicon redirects to the brand domain; GET / serves
  // a small branded page (also carrying a <link rel="icon"> brand signal).
  app.get("/favicon.ico", (_req: Request, res: Response) => {
    res.redirect(302, BRAND_FAVICON_URL);
  });
  app.get("/", (_req: Request, res: Response) => {
    res.type("html").send(landingPageHtml());
  });

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
    void handleMcpPost(
      req,
      res,
      verifier,
      credentialResolver,
      enableJsonResponse,
    );
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
  if (isHostAllowlistEmpty()) {
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
