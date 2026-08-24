/**
 * Per-request credential context for the remote (Streamable HTTP) transport.
 *
 * The stdio entry point reads credentials from process.env once per process.
 * The remote HTTP entry point serves many callers from one process, so the API
 * key and session id must be PER-REQUEST, not module-global. We carry them in an
 * AsyncLocalStorage store: the HTTP entry sets the store for the duration of one
 * request->response, and client.ts reads it when a context is active, falling
 * back to env when there is none (which preserves the stdio path and the
 * existing env-based unit tests).
 *
 * Stateless Streamable HTTP has no server-initiated push, so each request is
 * fully contained in a single async context — the exact case ALS handles
 * correctly. (Server-to-client streaming would break ALS continuity; do not
 * adopt this pattern if v1 ever goes stateful with push.)
 *
 * Side-effect-free on import: constructing an AsyncLocalStorage allocates no
 * resources and runs no I/O, matching the call-time config reads in client.ts.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The credentials resolved for a single inbound MCP request.
 *
 * - `apiKey`: the downstream Scholar Feed `sf_` key to forward to
 *   api.scholarfeed.org as the Bearer, or null for an anonymous request.
 * - `sessionId`: an opaque per-request id stamped as `X-SF-Session` so the
 *   backend can stitch one request's fan-out together. Generated fresh per
 *   request by the HTTP entry point (unlike the stdio path's per-process id).
 * - `clientIp`: the END CALLER's IP, forwarded so the backend can key rate
 *   limits and anonymous analytics per caller instead of per Worker egress.
 *   Without it EVERY anonymous remote caller collapses into one bucket keyed to
 *   our egress IP, which both shares one rate limit across all tenants and makes
 *   `usage_events.client_hash` a count of egress IPs rather than of clients.
 *   Optional: absent on the stdio path (which reaches the backend directly, so
 *   Heroku's X-Forwarded-For already carries the real IP) and absent whenever no
 *   proxy secret is configured.
 */
export interface RequestCreds {
  apiKey: string | null;
  sessionId: string;
  clientIp?: string | null;
}

/**
 * The ALS store. Exported so the HTTP entry point (and tests) can reference the
 * same instance; prefer the runWithCreds / getCurrentCreds helpers below.
 */
export const credsStore = new AsyncLocalStorage<RequestCreds>();

/**
 * Run `fn` with `creds` bound as the active request context. Everything awaited
 * synchronously within `fn` (the whole transport.handleRequest -> tool handler
 * -> client.* chain) sees these creds via getCurrentCreds().
 */
export function runWithCreds<T>(creds: RequestCreds, fn: () => T): T {
  return credsStore.run(creds, fn);
}

/**
 * The creds for the currently-active request, or undefined when no context is
 * set (the stdio path and the env-based unit tests). client.ts uses this to
 * decide between per-request creds and the process.env fallback.
 */
export function getCurrentCreds(): RequestCreds | undefined {
  return credsStore.getStore();
}
