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

/**
 * RFC-9457 `code` values whose `detail` is deliberate, user-facing copy that a
 * handler chose on purpose — the gate's own explanation of how to proceed.
 *
 * This is an ALLOWLIST, deliberately. A denylist of status-derived codes would be
 * fail-OPEN: any code not yet listed would pass its `detail` through verbatim, and
 * the backend is a separate repo, so nothing here enforces that coupling. That is a
 * live hazard, not a hypothetical one — health.py raises 503 with
 * detail={"error":"db_unavailable","message":str(e)}, which stringifies a raw
 * connection error (host, port, DSN) and would leak the moment anyone promotes it
 * to a named code, exactly as pro_required was promoted. Unknown codes must stay
 * opaque and fall through to the status-based messages below.
 */
/**
 * The ONLY origin a backend-supplied CTA link may resolve to. Compared with exact
 * origin equality (not a substring test) in withUpgradeUrl below, so a lookalike host
 * like evil-scholarfeed.org or scholarfeed.org.attacker.test cannot slip through.
 */
const SITE_ORIGIN = "https://www.scholarfeed.org";

const ACTIONABLE_PROBLEM_CODES = new Set([
  "pro_required",
  "quota_exceeded",
  "anon_daily_limit",
  // watches.py raises 403 code="watch_limit" with user-facing copy ("Free accounts
  // can keep N watches..."). It was missing here, so create_watch's wall fell through
  // to the generic status copy and the agent lost the one message that says how to
  // proceed. Verified present in the backend: api/routers/watches.py.
  "watch_limit",
]);

// NOTE: deliberately NOT a suffix rule (`code.endsWith("_limit")` etc.). A pattern
// match is fail-OPEN for exactly the reason the allowlist exists — it would auto-admit
// any future *_limit/*_exceeded code, including one whose detail carries internals.
// New codes get added here explicitly, after checking what the backend puts in detail.

/** The subset of the above that means "authenticated fine, but this needs Pro". */
const PRO_GATE_CODES = new Set(["pro_required"]);

/**
 * Surface a deliberate, user-facing error envelope from the backend.
 *
 * Two shapes count as deliberate:
 *
 *  1. `{ error, message }` — a raw JSONResponse business-rule wall, e.g. a
 *     quota/cap hit that carries an upgrade prompt ("Free tier includes 1
 *     watch. Pro lets you track more — scholarfeed.org/upgrade").
 *  2. `{ code, detail }` — the backend's RFC-9457 problem+json envelope, which
 *     every `HTTPException` is re-rendered into: the raiser's `message` becomes
 *     `detail`. Without this case those gates (embed_text's `pro_required`, and
 *     any future coded gate) went opaque, because the shape-1 keys are gone by
 *     the time the body reaches us.
 *
 * In both cases a machine code must accompany the human string — that pairing
 * is what marks an intentional, safe-to-show envelope. For shape 2 the code must
 * also be on the ACTIONABLE_PROBLEM_CODES allowlist. Plain or unstructured error
 * bodies, and any code we do not recognise, fall through to the generic
 * status-based messages, so we never leak internal error detail to the model.
 */
function structuredBackendMessage(body: string): string | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.error === "string" && typeof rec.message === "string") {
      return withUpgradeUrl(rec.message, rec.upgrade_url);
    }
    if (
      typeof rec.code === "string" &&
      typeof rec.detail === "string" &&
      ACTIONABLE_PROBLEM_CODES.has(rec.code)
    ) {
      return withUpgradeUrl(rec.detail, rec.upgrade_url);
    }
  } catch {
    // Body isn't JSON — fall through to the status-based messages.
  }
  return null;
}

/**
 * Append the backend's own CTA link to a wall message, as an absolute URL.
 *
 * Five backend sites send `upgrade_url` alongside the wall (public.py, auth.py,
 * alerts.py, billing.py, following.py) and it was being dropped on the floor, so the
 * agent got the explanation without the one thing it can act on. Most are RELATIVE
 * ("/pricing"), which is useless to a model with no origin — hence the absolute-ising.
 *
 * Only ever called on a body that already qualified as a deliberate wall above, so
 * this cannot promote an internal error envelope into user-facing copy.
 */
function withUpgradeUrl(human: string, raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return human;

  // Resolve against our own origin and then require that origin EXACTLY. The value
  // arrives in an HTTP response body and ends up in text the model relays to a user
  // as the next step to click, so an arbitrary absolute URL here is a phishing
  // vector — the same reason paper content gets fenced in this codebase. A substring
  // test (`/scholarfeed\.org/`) is not sufficient: evil-scholarfeed.org and
  // scholarfeed.org.attacker.test both contain it. new URL() + origin equality is
  // exact, and resolution makes the common relative case ("/pricing") absolute,
  // which a model with no origin cannot otherwise use.
  let url: string;
  try {
    const parsed = new URL(raw, SITE_ORIGIN);
    if (parsed.origin !== SITE_ORIGIN) return human;
    url = parsed.toString();
  } catch {
    return human; // unparseable — drop the CTA rather than emit garbage
  }

  // Skip when the copy already carries this link; several backend strings embed
  // their own, and a duplicate CTA reads as a formatting bug to the model.
  if (human.includes(url)) return human;
  return `${human} (${url})`;
}

/**
 * Does this 403 mean "no credentials were sent" rather than "not allowed"?
 *
 * FastAPI's `HTTPBearer(auto_error=True)` answers a MISSING Authorization
 * header with 403 "Not authenticated" — not 401 — so an unconfigured client
 * lands here, never in the 401 branch.
 *
 * Decided on the LOCAL FACT that we sent no key, not on the body text. Substring-
 * matching the raw body was a false-positive machine: a legitimately-keyed caller
 * hitting a 403 whose detail merely CONTAINS the phrase (e.g. "Repo owner is not
 * authenticated with GitHub") would be told its key was missing, paired with "do
 * not retry" — stranding a working client. The local fact is also strictly more
 * reliable: it covers a bare bodyless 403 or an HTML proxy/WAF page, where there
 * is no phrase to match at all.
 */
function isMissingCredentials(): boolean {
  return getApiKey() === null;
}

/**
 * Did the backend actually say "this needs Pro"?
 *
 * Only claim a Pro gate on the backend's own evidence — `code: "pro_required"` in
 * the problem+json envelope, or `error: "pro_required"` in the raw-JSONResponse
 * shape. Treating every keyed 403 as a Pro gate asserted "your key is valid" with
 * no evidence and sent the caller to a pricing page, which is wrong (and costly)
 * for a revoked key, an admin-only route, or a WAF block.
 */
function isProGate(body: string): boolean {
  if (!body) return false;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object") return false;
    const rec = parsed as Record<string, unknown>;
    return (
      (typeof rec.code === "string" && PRO_GATE_CODES.has(rec.code)) ||
      (typeof rec.error === "string" && PRO_GATE_CODES.has(rec.error))
    );
  } catch {
    return false;
  }
}

/**
 * How the caller of THIS process supplies a key — the remedy differs per
 * transport, so a single "set SF_API_KEY" line would be wrong half the time.
 * An active creds context means we are the remote (Streamable HTTP) endpoint,
 * where each request carries its own key in the Authorization header and
 * SF_API_KEY must never be set server-side (it would leak across tenants).
 */
function missingKeyRemedy(): string {
  if (getCurrentCreds()) {
    return (
      "This request was sent without a Scholar Feed API key. Get one at " +
      "https://www.scholarfeed.org/settings and send it as an `Authorization: Bearer sf_...` " +
      "header to this MCP endpoint. Do NOT retry this call until the key is attached — " +
      "it will keep failing."
    );
  }
  return (
    "No API key was sent, so this endpoint refused the request. Set SF_API_KEY " +
    "to a key from https://www.scholarfeed.org/settings in your MCP server config " +
    "(the `env` block), then restart the MCP server. Do NOT retry this call until " +
    "the key is set — it will keep failing."
  );
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

    // A deliberate envelope ({ error, message } or a coded problem+json detail —
    // e.g. a quota/cap wall with an upgrade prompt) wins over the generic
    // status-based copy below.
    const structured = structuredBackendMessage(body);
    if (structured) throw new Error(structured);

    switch (response.status) {
      case 401:
        throw new Error(
          "Authentication failed: your SF_API_KEY is invalid or has been revoked. " +
            "Check your key at https://www.scholarfeed.org/settings",
        );
      case 403:
        // Two very different 403s, and an agent must be able to tell them apart:
        // no credentials sent at all (fix = set a key) vs a valid key that lacks
        // Pro (fix = upgrade, or fall back to a free tool). The old single copy
        // ("You may need a valid API key") named neither, and its "may" invited
        // a retry that cannot succeed.
        if (isMissingCredentials()) {
          throw new Error(missingKeyRemedy());
        }
        if (isProGate(body)) {
          throw new Error(
            "This feature requires a Scholar Feed Pro plan. Start a free trial or " +
              "upgrade at https://www.scholarfeed.org/pricing. In the meantime, " +
              "search_papers / get_paper / get_citations / check_drift work without Pro.",
          );
        }
        // A key WAS sent and the backend did not say "pro_required". We cannot tell
        // why from here — a revoked key, an admin-only route, or a Cloudflare WAF
        // block all land in this branch — so do not assert that the key is valid and
        // do not send the caller to a pricing page for a problem money cannot fix.
        throw new Error(
          "Request forbidden (HTTP 403). A key was sent, so this is not a missing-key " +
            "error: the key may be revoked, the endpoint may require a plan or role your " +
            "account lacks, or an edge/WAF rule may have blocked the request. Check the " +
            "key at https://www.scholarfeed.org/settings; retrying unchanged will not help.",
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
