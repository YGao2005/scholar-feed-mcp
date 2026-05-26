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
 * CRITICAL: All logging uses console.error() — never console.log().
 * console.log() on stdout would corrupt the JSON-RPC stdio transport.
 */

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

function getApiKey(): string | null {
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
      headers: {
        ...authHeaders(),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make a POST request to the Scholar Feed API.
   * Throws Error on non-2xx response or timeout.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return response.json() as Promise<T>;
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
      throw err;
    }
  }

  /**
   * Map HTTP error responses to actionable error messages.
   * Logs full body to stderr for debugging; throws a clean message.
   */
  private async throwApiError(response: Response): Promise<never> {
    const body = await response.text();
    console.error(`[client] API error ${response.status}:`, body.slice(0, 500));

    switch (response.status) {
      case 401:
        throw new Error(
          "Authentication failed: your SF_API_KEY is invalid or has been revoked. " +
            "Check your key at https://www.scholarfeed.org/settings",
        );
      case 403:
        throw new Error(
          "Access denied. You may need a valid API key for this endpoint.",
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
