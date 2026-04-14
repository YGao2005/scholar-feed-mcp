/**
 * ScholarFeedClient — wraps fetch calls to the Scholar Feed Heroku API.
 *
 * Reads SF_API_KEY from process.env at module load. If missing, logs error
 * to stderr and exits(1).
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 * console.log() on stdout would corrupt the JSON-RPC stdio transport.
 */

const apiKey = process.env.SF_API_KEY;
if (!apiKey) {
  console.error(
    "Error: SF_API_KEY environment variable is required.\n" +
    "Set it in your MCP config:\n" +
    '  "env": { "SF_API_KEY": "sf_your_key_here" }'
  );
  process.exit(1);
}

const baseUrl =
  process.env.SF_API_BASE_URL ??
  "https://api.scholarfeed.org/api/v1";

class ScholarFeedClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Make an authenticated GET request to the Scholar Feed API.
   * Throws Error on non-2xx response.
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      url = `${url}?${qs}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an authenticated POST request to the Scholar Feed API.
   * Throws Error on non-2xx response.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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
   * Make an authenticated POST request that returns the raw Response for
   * SSE streaming.
   *
   * Sets Accept: text/event-stream header.
   */
  async fetchSSE(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return response;
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
          "Check your key at https://www.scholarfeed.org/settings"
        );
      case 403:
        throw new Error("Access denied. You may need a valid API key for this endpoint.");
      case 429:
        throw new Error(
          "Rate limit exceeded. Wait a moment and try again, or upgrade to Pro for higher limits."
        );
      default:
        // Truncate body to avoid leaking internal details to LLM
        throw new Error(`API request failed (HTTP ${response.status})`);
    }
  }
}

export const client = new ScholarFeedClient(apiKey, baseUrl);
