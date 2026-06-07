/**
 * ScholarFeedClient — wraps fetch calls to the Scholar Feed API.
 *
 * SF_API_KEY is optional. Without it, requests are anonymous with lower
 * rate limits (100 calls/day). With a key, limits are 1,000 calls/day per account.
 *
 * Config (SF_API_KEY, SF_API_BASE_URL, SF_API_TIMEOUT_MS) is read at call time,
 * so importing this module has no side effects — that keeps the unit tests honest
 * and lets each test set env per case.
 *
 * The API key and session id additionally honor a per-request AsyncLocalStorage
 * context when one is active (the remote Streamable HTTP transport sets it),
 * falling back to process.env / a per-process singleton when there is none (the
 * stdio path). See src/http/credentials.ts.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 * console.log() on stdout would corrupt the JSON-RPC stdio transport.
 */

import { randomUUID } from "node:crypto";
import { getCurrentCreds } from "./http/credentials.js";

const DEFAULT_BASE_URL = "https://api.scholarfeed.org/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

// SF_API_BASE_URL is a self-hosting / testing override. It is the fetch target
// AND receives the `Authorization: Bearer` key, so whoever sets this env var is
// trusted with the key — the same trust already implied by controlling the
// process environment. Intentionally not constrained to an allowlist: that
// would break self-hosting and the test suite (which points this at
// example.test). The trust boundary is documented in SECURITY.md.
function getBaseUrl(): string {
  return process.env.SF_API_BASE_URL ?? DEFAULT_BASE_URL;
}

// API key resolution. On the remote (Streamable HTTP) transport an
// AsyncLocalStorage context carries the per-request key, so each caller forwards
// its OWN downstream key. With no active context (the stdio path and the
// env-based unit tests) we fall back to process.env, preserving current
// behavior. Note `getCurrentCreds().apiKey` may itself be null (an anonymous
// remote request); in that case we honor the null and do NOT fall through to the
// process env, so a server-level SF_API_KEY can never leak into an anonymous
// remote request.
function getApiKey(): string | null {
  const creds = getCurrentCreds();
  if (creds) return creds.apiKey;
  return process.env.SF_API_KEY ?? null;
}

function getTimeoutMs(): number {
  const raw = process.env.SF_API_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/**
 * A stable per-process session id, generated lazily on first request and reused
 * for the life of the process. One stdio MCP process is one client session, so
 * stamping every request with it lets the backend stitch a single agent
 * session's calls together — and tell genuine activity apart from one reasoning
 * loop that fans out into dozens of tool calls. Generated lazily (not at import)
 * to keep importing this module side-effect-free, matching the call-time config
 * reads above. Opaque random value — carries no user or environment identity.
 */
let sessionId: string | null = null;
function getSessionId(): string {
  // On the remote transport each request supplies its own fresh session id via
  // the ALS context; use it so the backend collapses that one request's fan-out
  // (not the whole multi-tenant process) into a single session. With no active
  // context, fall back to the stdio path's per-process lazy singleton.
  const creds = getCurrentCreds();
  if (creds) return creds.sessionId;
  return (sessionId ??= randomUUID());
}

/**
 * Headers shared by every request: auth (when keyed), the session id, then the
 * caller's Accept/Content-Type. Centralizing them keeps the per-verb methods
 * from each re-implementing the common set.
 */
function requestHeaders(extra: Record<string, string>): Record<string, string> {
  return {
    ...authHeaders(),
    "X-SF-Session": getSessionId(),
    ...extra,
  };
}

const SITE_URL = "https://www.scholarfeed.org";

/**
 * Resolve a backend CTA/upgrade URL to an absolute scholarfeed.org link. The API
 * returns relative paths (e.g. `upgrade_url: "/pricing"`); absolute URLs pass
 * through unchanged.
 */
function resolveUpgradeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${SITE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/**
 * Business-rule codes whose human-facing string is authored FOR the end user (a
 * conversion / quota / upgrade wall) and is therefore safe and intended to relay
 * to the model. Explicit set plus the `_required` / `_exceeded` / `_limit`
 * suffixes, so a new quota code is covered without a client release. Generic
 * internal codes (e.g. `forbidden`, `internal_error`) are deliberately excluded
 * so their `detail` falls through to the curated status-based copy below.
 */
const BUSINESS_CODES = new Set([
  "pro_required",
  "payment_required",
  "watch_limit",
  "quota_exceeded",
  "rate_limited",
  "free_tier_limit",
  "monthly_limit",
]);

function isBusinessCode(code: string): boolean {
  return (
    BUSINESS_CODES.has(code) ||
    code.endsWith("_required") ||
    code.endsWith("_exceeded") ||
    code.endsWith("_limit")
  );
}

/**
 * Surface a deliberate, user-facing error envelope from the backend.
 *
 * The API marks intentional business-rule walls two ways: the legacy
 * `{ error, message }` pairing, and the RFC 7807 problem+json shape it actually
 * emits today — `{ detail, code, upgrade_url, ... }` (e.g. an anonymous caller of
 * a Pro tool gets `code: "pro_required", detail: "Text embeddings are a Pro
 * feature. Start a free 14-day Pro trial…", upgrade_url: "/pricing"`). We surface
 * that human string verbatim — plus the resolved CTA URL — so the agent relays a
 * real next step to the user instead of a dead end. (Before this, the client only
 * recognized `{ error, message }`, so every RFC 7807 conversion prompt was
 * discarded and replaced by the generic "Access denied" copy — the funnel's
 * worst leak: engaged anonymous users hit a Pro tool and saw no way forward.)
 *
 * A body is treated as a wall ONLY when it carries a recognized business code, an
 * explicit `upgrade_url`, or the legacy error+message pair. A bare `detail` /
 * `message` on an internal error is NOT surfaced, so we never leak incidental
 * internal error strings to the model.
 */
function structuredBackendMessage(body: string): string | null {
  if (!body) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Body isn't JSON — fall through to the status-based messages.
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  // The machine code may live in RFC 7807 `code` or the legacy `error` field.
  const code =
    (typeof obj.code === "string" && obj.code) ||
    (typeof obj.error === "string" && obj.error) ||
    null;
  const upgradeUrl = resolveUpgradeUrl(obj.upgrade_url);
  const legacyPair =
    typeof obj.error === "string" && typeof obj.message === "string";

  const isWall =
    legacyPair || upgradeUrl !== null || (code !== null && isBusinessCode(code));
  if (!isWall) return null;

  // Prefer the legacy `message`, else the RFC 7807 `detail`.
  const human =
    typeof obj.message === "string"
      ? obj.message
      : typeof obj.detail === "string"
        ? obj.detail
        : null;
  if (!human) return null;

  // Append the CTA URL when the backend gave one and the message doesn't already
  // point somewhere — so the agent always has a concrete next step.
  if (upgradeUrl && !human.includes(upgradeUrl) && !/scholarfeed\.org/i.test(human)) {
    return `${human} (${upgradeUrl})`;
  }
  return human;
}

class ScholarFeedClient {
  /**
   * GET with flat query params. Throws Error on non-2xx response or timeout.
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const search =
      params && Object.keys(params).length > 0
        ? new URLSearchParams(params)
        : undefined;
    return this.getWithParams<T>(path, search);
  }

  /**
   * GET allowing repeated / array-valued query params
   * (e.g. ?arxiv_ids[]=A&arxiv_ids[]=B). Shares auth, timeout, and error
   * handling with get() — callers that need repeated params build a
   * URLSearchParams and pass it here instead of re-implementing fetch.
   */
  async getWithParams<T>(path: string, search?: URLSearchParams): Promise<T> {
    let url = `${getBaseUrl()}${path}`;
    if (search && [...search].length > 0) {
      url = `${url}?${search.toString()}`;
    }

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: requestHeaders({ Accept: "application/json" }),
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return this.parseJson<T>(await response.text(), response.status);
  }

  /**
   * Make a POST request to the Scholar Feed API.
   * Throws Error on non-2xx response or timeout.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: requestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return this.parseJson<T>(await response.text(), response.status);
  }

  /** Make a PATCH request (partial update). Throws on non-2xx / timeout. */
  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(`${getBaseUrl()}${path}`, {
      method: "PATCH",
      headers: requestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return this.parseJson<T>(await response.text(), response.status);
  }

  /**
   * Make a DELETE request to the Scholar Feed API.
   * Returns null for a 204 No Content (the common case for membership-removal),
   * else the parsed JSON body. Throws Error on non-2xx response or timeout.
   */
  async del<T>(path: string): Promise<T | null> {
    const response = await this.fetchWithTimeout(`${getBaseUrl()}${path}`, {
      method: "DELETE",
      headers: requestHeaders({ Accept: "application/json" }),
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    if (response.status === 204) return null;
    const body = await response.text();
    return body ? this.parseJson<T>(body, response.status) : null;
  }

  /**
   * Parse a 2xx body as JSON, defensively. A successful status with a non-JSON
   * body — a proxy/CDN HTML interstitial (Heroku "Application error", a 502 page),
   * a truncated body, or a 200 wrapping an upstream error page — would otherwise
   * throw an opaque `SyntaxError: Unexpected token '<'…` whose message carries a
   * RAW UPSTREAM FRAGMENT straight to the model (it bypasses throwApiError, which
   * only runs on non-2xx). Turn it into a clean, sanitized error; log the body to
   * stderr only, never to the returned message.
   */
  private parseJson<T>(body: string, status: number): T {
    try {
      return JSON.parse(body) as T;
    } catch {
      console.error(
        `[client] non-JSON ${status} response body:`,
        body.slice(0, 500),
      );
      throw new Error(
        `The Scholar Feed API returned an unreadable (non-JSON) response (HTTP ${status}). ` +
          "This is usually a transient upstream or proxy error — try again shortly.",
      );
    }
  }

  /**
   * fetch() wrapper that enforces a request timeout via AbortSignal.timeout.
   * An unbounded fetch can hang a tool call forever if the backend stalls;
   * the timeout turns that into a clear, actionable error instead.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const timeoutMs = getTimeoutMs();
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // AbortSignal.timeout fires a "TimeoutError"; a manual abort is "AbortError".
      if (
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError")
      ) {
        throw new Error(
          `Request timed out after ${Math.round(timeoutMs / 1000)}s — the Scholar Feed API did not respond. ` +
            "Raise the limit with SF_API_TIMEOUT_MS if needed.",
        );
      }
      // Any other fetch failure (DNS, ECONNREFUSED, TLS, undici "fetch failed")
      // must not surface raw: the error — and especially `err.cause` — can
      // disclose the backend hostname / resolved IP / port (e.g.
      // "getaddrinfo ENOTFOUND <host>", "connect ECONNREFUSED <ip:port>") to the
      // model. Log the raw error to stderr only and throw a sanitized message.
      console.error(
        "[client] network error reaching the Scholar Feed API:",
        err,
      );
      throw new Error(
        "Could not reach the Scholar Feed API (a transient network or upstream " +
          "error). Please try again shortly.",
      );
    }
  }

  /**
   * Map HTTP error responses to actionable error messages.
   * Logs full body to stderr for debugging; throws a clean message.
   */
  private async throwApiError(response: Response): Promise<never> {
    const body = await response.text();
    console.error(`[client] API error ${response.status}:`, body.slice(0, 500));

    // A deliberate { error, message } envelope (e.g. a quota/cap wall with an
    // upgrade prompt) wins over the generic status-based copy below.
    const structured = structuredBackendMessage(body);
    if (structured) throw new Error(structured);

    switch (response.status) {
      case 401:
        throw new Error(
          "Authentication failed: your SF_API_KEY is invalid or has been revoked. " +
            "Check your key at https://www.scholarfeed.org/settings",
        );
      case 403:
        // The most common 403 is an anonymous caller hitting an account- or
        // Pro-gated tool — the highest-intent conversion moment. Give a concrete
        // path forward (account → key → config) rather than a dead end.
        throw new Error(
          "This Scholar Feed tool needs an account. Create a free one at " +
            "https://www.scholarfeed.org/settings — it includes a 14-day Pro " +
            "trial (no card) plus free daily paper watches — then set the key as " +
            "SF_API_KEY in your MCP config (or run `npx scholar-feed-mcp@latest init`).",
        );
      case 429:
        throw new Error(
          "Rate limit exceeded. Add an API key for higher limits — " +
            "get one free at https://www.scholarfeed.org/settings",
        );
      default:
        // Truncate body to avoid leaking internal details to LLM
        throw new Error(`API request failed (HTTP ${response.status})`);
    }
  }
}

export const client = new ScholarFeedClient();
