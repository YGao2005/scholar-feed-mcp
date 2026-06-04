/**
 * RFC 9728 OAuth 2.0 Protected Resource Metadata for the remote MCP server.
 *
 * Hosts that hit `/mcp` without (or with an invalid) token receive a
 * `401 + WWW-Authenticate: Bearer resource_metadata="<url>", scope="sf:read"`.
 * They then GET the protected-resource metadata document advertised in that
 * header to discover which Authorization Server(s) can mint a token for this
 * resource. We hand-roll the two `.well-known` routes (rather than mounting the
 * SDK `mcpAuthMetadataRouter`, which also wants a full AS metadata object) so
 * the document is exactly the RFC 9728 shape the spec section 5 fixes and so
 * it stays a thin, framework-light handler for the eventual Workers port.
 *
 * Both the bare path and the `/mcp`-suffixed path are served because clients
 * derive the metadata URL two ways: some use the bare well-known path, others
 * append the resource's path component per RFC 9728 section 3.1
 * (`/.well-known/oauth-protected-resource/mcp`). Serving both avoids a
 * discovery miss.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import type { Express, Request, Response } from "express";
import type { OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

/** Canonical MCP resource URI / token `aud` when env does not override it. */
const DEFAULT_RESOURCE_URI = "https://mcp.scholarfeed.org/mcp";

/**
 * The OAuth scopes this resource understands. Minimal `sf:read` plus the
 * step-up scopes account tools will request. Advertised so hosts can request
 * them incrementally rather than at first consent (scope-inflation guard).
 */
export const SUPPORTED_SCOPES = [
  "sf:read",
  "sf:library",
  "sf:collections",
  "sf:watches",
  "sf:pro",
] as const;

/** The two well-known paths we serve the protected-resource doc under. */
export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
export const PROTECTED_RESOURCE_PATH_MCP =
  "/.well-known/oauth-protected-resource/mcp";

/** The MCP resource URI (token `aud`). Read at call time so tests can set env. */
export function resourceUri(): string {
  return process.env.SF_MCP_RESOURCE_URI ?? DEFAULT_RESOURCE_URI;
}

/**
 * Build the RFC 9728 protected-resource metadata document. `authorization_servers`
 * is populated from SF_OAUTH_ISSUER when set; omitted (rather than an empty
 * array, which is invalid per the schema) when no issuer is configured yet so
 * the document still validates during the AS-pending window.
 */
export function buildProtectedResourceMetadata(): OAuthProtectedResourceMetadata {
  const issuer = process.env.SF_OAUTH_ISSUER;
  const metadata: OAuthProtectedResourceMetadata = {
    resource: resourceUri(),
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
  };
  if (issuer) {
    metadata.authorization_servers = [issuer];
  }
  return metadata;
}

/**
 * The absolute URL of the protected-resource metadata document, for the
 * `resource_metadata` field of the WWW-Authenticate challenge. Derived from the
 * resource URI's origin so it tracks SF_MCP_RESOURCE_URI automatically.
 */
export function protectedResourceMetadataUrl(): string {
  const origin = new URL(resourceUri()).origin;
  return `${origin}${PROTECTED_RESOURCE_PATH}`;
}

/**
 * Emit an RFC 9728 / RFC 6750 `401 Unauthorized` with the WWW-Authenticate
 * challenge that points the host at the protected-resource metadata. This is
 * the single place the challenge header is constructed so every unauthenticated
 * path produces an identical, spec-correct value.
 *
 * Header form:
 *   WWW-Authenticate: Bearer resource_metadata="<url>", scope="sf:read"
 *
 * The `scope` advertises the minimum scope (`sf:read`); a host that needs a
 * step-up scope discovers it from the metadata document's `scopes_supported`.
 */
export function unauthorizedResponse(
  res: Response,
  message = "Authentication required: a valid OAuth bearer token is needed for this tool.",
): void {
  const challenge =
    `Bearer resource_metadata="${protectedResourceMetadataUrl()}", ` +
    `scope="sf:read"`;
  res.setHeader("WWW-Authenticate", challenge);
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message },
    id: null,
  });
}

/**
 * Mount the RFC 9728 metadata routes at the app root. Serves the same document
 * at the bare and `/mcp`-suffixed well-known paths (see file header).
 */
export function mountMetadataRoutes(app: Express): void {
  const handler = (_req: Request, res: Response): void => {
    res.status(200).json(buildProtectedResourceMetadata());
  };
  app.get(PROTECTED_RESOURCE_PATH, handler);
  app.get(PROTECTED_RESOURCE_PATH_MCP, handler);
}
