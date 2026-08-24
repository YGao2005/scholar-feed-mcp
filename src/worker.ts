/**
 * Scholar Feed MCP — Cloudflare Workers (Streamable HTTP) entry point.
 *
 * A THIRD surface alongside the stdio package (src/index.ts) and the Node/Express
 * remote server (src/server-http.ts). It serves the SAME stateless MCP surface as
 * server-http.ts — every POST /mcp builds a fresh McpServer + transport, runs the
 * request inside a per-request credential context (AsyncLocalStorage, see
 * src/http/credentials.ts), and the request is fully contained in one async
 * context. GET/DELETE /mcp return 405 (stateless has no session to resume/delete).
 *
 * It reuses the runtime-agnostic modules verbatim:
 *   - resolveRequestCreds + the DNS-rebinding guards (src/http/resolve-creds.ts),
 *   - the ES256/JWKS verifier (src/http/oauth/verifier.ts),
 *   - the RFC 9728 metadata builder (src/http/oauth/metadata.ts),
 *   - the per-request ALS creds (src/http/credentials.ts),
 *   - registerAllTools + buildServerInfo,
 * and swaps ONLY the entry/transport: the Web Standard transport
 * (WebStandardStreamableHTTPServerTransport) whose handleRequest(request) returns
 * a Web `Response`, instead of Express's req/res.
 *
 * CONFIG BRIDGE (critical Workers gotcha): client.ts / the verifier / the guards
 * read process.env, but Cloudflare passes config on the `env` arg. With
 * nodejs_compat + a recent compatibility date, [vars] are also exposed on
 * process.env, so the shim below is a SAFETY NET that idempotently copies the
 * static CONFIG keys from env into process.env when present and not already set.
 * SF_API_KEY is NEVER copied — each request derives its own key (a process-level
 * key would be a latent cross-tenant leak). Config is static, so writing
 * process.env across requests is race-free.
 *
 * CRITICAL: All logging uses console.error() — never console.log(). stdout
 * hygiene is enforced across server runtime files by a test + lint rule.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { registerAllTools } from "./tools/index.js";
import {
  buildServerInfo,
  SERVER_INSTRUCTIONS,
  landingPageHtml,
} from "./server-info.js";
import { faviconArrayBuffer } from "./favicon-asset.js";
import { runWithCreds } from "./http/credentials.js";
import { ScholarFeedTokenVerifier } from "./http/oauth/verifier.js";
import {
  buildProtectedResourceMetadata,
  protectedResourceMetadataUrl,
  PROTECTED_RESOURCE_PATH,
  PROTECTED_RESOURCE_PATH_MCP,
} from "./http/oauth/metadata.js";
import {
  UnconfiguredCredentialResolver,
  type CredentialResolver,
} from "./http/oauth/credential-resolver.js";
import {
  resolveRequestCreds,
  isOriginAllowed,
  isHostAllowed,
} from "./http/resolve-creds.js";

/**
 * The package version, substituted at BUNDLE time by esbuild/wrangler.
 *
 * The other two entry points read it with `createRequire("../package.json")`,
 * but that pattern does NOT bundle cleanly for Workers: esbuild leaves a literal
 * runtime `require("../package.json")` that the single-file Workers bundle cannot
 * resolve (there is no adjacent package.json, and nodejs_compat's createRequire
 * can't read arbitrary files at runtime). Instead, `SF_WORKER_VERSION` is a
 * global string that wrangler's `--define` replaces with the package.json version
 * at deploy/dryrun (see the `worker:*` npm scripts, which read it from
 * package.json so it never drifts). `declare const` keeps tsc happy under
 * `rootDir: src` without importing package.json into the TS program; the `?.` /
 * fallback covers `wrangler dev` invoked without the define.
 */
declare const SF_WORKER_VERSION: string | undefined;
const version: string =
  typeof SF_WORKER_VERSION === "string" ? SF_WORKER_VERSION : "0.0.0-dev";

/**
 * The static CONFIG keys the runtime modules read from process.env. Copied from
 * the Cloudflare `env` arg into process.env as a safety net (see file header).
 * SF_API_KEY is DELIBERATELY ABSENT — the remote server must never carry a
 * process-level key.
 */
const CONFIG_ENV_KEYS = [
  "SF_API_BASE_URL",
  "SF_API_TIMEOUT_MS",
  // The shared secret that lets the backend TRUST our X-Real-Client-IP header
  // (it compares against PROXY_SECRET before honoring the IP, else it falls back
  // to X-Forwarded-For). This is a secret, yet unlike SF_API_KEY it is CORRECT at
  // process level: it identifies THIS SERVER to the backend, and is identical for
  // every tenant. SF_API_KEY is per-tenant, which is why bridging it would be a
  // cross-tenant leak. Do not use this distinction to justify adding any other key.
  "SF_PROXY_SECRET",
  "SF_MCP_ALLOWED_HOSTS",
  "SF_MCP_ALLOWED_ORIGINS",
  "SF_MCP_RESOURCE_URI",
  "SF_MCP_AUDIENCE",
  "SF_OAUTH_ISSUER",
  "SF_OAUTH_JWKS_URL",
  "SF_OAUTH_ENFORCE_ISSUER",
  "SF_MCP_ICON_URL",
] as const;

/** The env bag Cloudflare hands to fetch(). Only string config vars matter here. */
type WorkerEnv = Record<string, unknown>;

/**
 * Idempotently copy the static CONFIG keys from the Workers `env` bag into
 * process.env when present and not already set. Config is static so this is
 * race-free across requests. NEVER copies SF_API_KEY (asserted by CONFIG_ENV_KEYS
 * omitting it). Runs at the top of every fetch() but is a no-op after the first.
 */
function bridgeConfigToProcessEnv(env: WorkerEnv): void {
  for (const key of CONFIG_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Per-process OAuth primitives (M4), identical to server-http.ts: an env-driven
// ES256/JWKS verifier and the fail-loud UnconfiguredCredentialResolver (the
// backend credential model, open decision #8, is not yet chosen). Constructing
// the verifier reads env, so it is created lazily on first request (AFTER the
// config bridge has run) rather than at module top level.
let defaultVerifier: OAuthTokenVerifier | undefined;
const defaultCredentialResolver: CredentialResolver =
  new UnconfiguredCredentialResolver();

function getVerifier(): OAuthTokenVerifier {
  return (defaultVerifier ??= new ScholarFeedTokenVerifier());
}

/** JSON Response helper (the Web Standard equivalent of res.status().json()). */
function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** A JSON-RPC error envelope Response (id null: pre-dispatch transport errors). */
function jsonRpcError(
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(
    status,
    { jsonrpc: "2.0", error: { code, message }, id: null },
    headers,
  );
}

/**
 * The RFC 9728 / RFC 6750 401 challenge that points the host at the
 * protected-resource metadata. Mirrors unauthorizedResponse() in metadata.ts,
 * emitted as a Web `Response` (the Express version writes to res).
 */
function unauthorizedResponse(): Response {
  const challenge =
    `Bearer resource_metadata="${protectedResourceMetadataUrl()}", ` +
    `scope="sf:read"`;
  return jsonRpcError(
    401,
    -32001,
    "Authentication required: a valid OAuth bearer token is needed for this tool.",
    { "WWW-Authenticate": challenge },
  );
}

/** Handle one stateless POST /mcp via the Web Standard transport. */
async function handleMcpPost(
  request: Request,
  verifier: OAuthTokenVerifier,
  resolver: CredentialResolver,
): Promise<Response> {
  // Resolve creds BEFORE building the server so a 401/501 short-circuits without
  // standing up an McpServer + transport for a request we will not serve. The
  // sf_/anonymous/JWT/401/501 decision is the SAME framework-neutral function the
  // Express server uses (src/http/resolve-creds.ts).
  let resolution;
  try {
    resolution = await resolveRequestCreds(
      request.headers.get("authorization") ?? undefined,
      verifier,
      resolver,
    );
  } catch (err) {
    console.error("[worker] error resolving request creds:", err);
    return jsonRpcError(500, -32603, "Internal server error");
  }

  if (resolution.kind === "unauthorized") {
    // Invalid / unverifiable OAuth token: 401 + WWW-Authenticate challenge.
    return unauthorizedResponse();
  }

  if (resolution.kind === "not-configured") {
    // Token verified, but no backend credential model yet (open decision #8).
    return jsonRpcError(501, -32002, resolution.message);
  }

  const server = new McpServer(buildServerInfo(version), {
    instructions: SERVER_INSTRUCTIONS,
  });
  registerAllTools(server);

  // Stateless: no session id, no session validation, GET/DELETE unsupported.
  // A fresh transport per request is REQUIRED (the transport throws if a
  // stateless instance is reused) — and matches the per-request isolation model.
  //
  // enableJsonResponse: true is the key difference from the Express server. The
  // Node server defaults to SSE and tears the transport down on res.on("close")
  // — a hook the Workers fetch model does NOT have. In SSE mode handleRequest
  // returns IMMEDIATELY with an open ReadableStream that the transport writes to
  // later via send(); closing the transport in a finally would race that write
  // and truncate the body (observed empty in wrangler dev). In JSON mode
  // handleRequest returns a Promise that resolves only once ALL JSON-RPC
  // responses are buffered into a single application/json Response — so awaiting
  // it means the work is done and tearing down afterwards is race-free. This
  // stateless server has no server->client push, so JSON mode loses nothing and
  // the surface stays identical (the host's Accept already lists application/json).
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  let response: Response;
  try {
    await server.connect(transport);
    // Bind the per-request creds for the whole handleRequest -> tool -> client
    // chain via AsyncLocalStorage, then let the transport drive the Response.
    // handleRequest reads the body off the Request itself (no parsedBody passed).
    // Forward the END CALLER's IP so the backend keys anonymous rate limits and
    // analytics per caller. CF-Connecting-IP is set by Cloudflare at the edge and
    // cannot be spoofed by the client, so it is safe to trust here; the backend
    // additionally requires a matching X-Proxy-Secret before honoring it, and
    // client.ts sends neither header unless BOTH are present.
    response = await runWithCreds(
      {
        ...resolution.creds,
        clientIp: request.headers.get("CF-Connecting-IP"),
      },
      () => transport.handleRequest(request),
    );
  } catch (err) {
    console.error("[worker] error handling POST /mcp:", err);
    void transport.close();
    void server.close();
    return jsonRpcError(500, -32603, "Internal server error");
  }

  // Tear down the per-request server + transport now that the JSON Response is
  // fully resolved (JSON mode buffers all responses before resolving, so there
  // is no in-flight stream to truncate). Keeps tenants isolated per request.
  void transport.close();
  void server.close();
  return response;
}

/**
 * The Cloudflare Workers entry point. Per-request routing over the Web Standard
 * fetch handler — a direct URL/method switch (no framework) since the surface is
 * just the two well-known metadata paths plus /mcp.
 */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    // CONFIG BRIDGE first: the runtime modules read process.env, Cloudflare puts
    // config on `env`. Idempotent + race-free (config is static); never copies
    // SF_API_KEY.
    bridgeConfigToProcessEnv(env);

    const { pathname } = new URL(request.url);
    const method = request.method.toUpperCase();

    // Public branding endpoints, handled BEFORE the DNS-rebinding guards because
    // they carry NO MCP data — just a public logo + a human landing page. A host
    // like claude.ai renders the connector icon from the ORIGIN's favicon; with
    // these unrouted the bare origin falls back to the hosting platform's logo.
    // Mirrors the GET / + GET /favicon.ico routes in server-http.ts.
    if (method === "GET" && pathname === "/favicon.ico") {
      return new Response(faviconArrayBuffer(), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
    if (method === "GET" && pathname === "/") {
      return new Response(landingPageHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // DNS-rebinding guard (Origin half): reject browser cross-site Origins not on
    // the allowlist. Identical policy to server-http.ts.
    if (!isOriginAllowed(request.headers.get("origin") ?? undefined)) {
      return jsonRpcError(403, -32000, "Forbidden: origin not allowed");
    }

    // DNS-rebinding guard (Host half): pin the Host header. Origin alone misses
    // rebinding attacks that send no Origin and a Host of the attacker's domain.
    if (!isHostAllowed(request.headers.get("host") ?? undefined)) {
      return jsonRpcError(403, -32000, "Forbidden: host not allowed");
    }

    // RFC 9728 protected-resource metadata, served at both the bare and the
    // /mcp-suffixed well-known paths (see metadata.ts header).
    if (
      method === "GET" &&
      (pathname === PROTECTED_RESOURCE_PATH ||
        pathname === PROTECTED_RESOURCE_PATH_MCP)
    ) {
      return jsonResponse(200, buildProtectedResourceMetadata());
    }

    if (pathname === "/mcp") {
      if (method === "POST") {
        return handleMcpPost(request, getVerifier(), defaultCredentialResolver);
      }
      // GET/DELETE /mcp in stateless mode: no session to stream or delete.
      return jsonRpcError(
        405,
        -32000,
        "Method Not Allowed: this stateless MCP server only accepts POST",
      );
    }

    return jsonRpcError(404, -32601, "Not Found");
  },
};
