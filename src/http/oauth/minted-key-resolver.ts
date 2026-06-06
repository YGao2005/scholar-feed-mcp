/**
 * The token->key bridge, credential-bridge "model a" (open decision #8).
 *
 * After the verifier validates a Supabase-issued OAuth access token, this
 * resolver obtains the DOWNSTREAM credential the backend is called with. Per
 * model (a) it does NOT forward the user's OAuth token (no confused-deputy
 * passthrough). Instead it asks the backend's internal provisioning endpoint
 * (POST /api/v1/mcp/resolve-key, guarded by a shared provisioning secret) for a
 * PER-USER sf_ API key minted once and stored encrypted server-side, and
 * returns THAT as the ResolvedCredential. The OAuth path then reuses the whole
 * existing sf_-key machinery (durable 10k/day cap, per-key usage attribution,
 * revocation) unchanged.
 *
 * Why a per-user sf_ key (not a service key + header, and not the user JWT):
 *   - least privilege: a per-user, independently-revocable key, not an
 *     act-as-any-user service credential;
 *   - AS-portable: the RS<->backend contract is an sf_ key, independent of the
 *     Authorization Server, so swapping Supabase for WorkOS/Auth0 later changes
 *     only verifier config;
 *   - strict no-passthrough: the user's OAuth token never leaves this server.
 *
 * Caching: the raw key is cached in memory keyed by the verified `sub` for a
 * short TTL so the stateless transport does not hit the backend on every tool
 * call. The key is per-user (not per-request), so a process-wide cache is
 * correct; concurrent first-time resolves are idempotent (the backend
 * serializes minting per user and returns the same key).
 *
 * SECURITY: never log the provisioning secret or any sf_ key. All logging uses
 * console.error() (stdout stays JSON-RPC-only on the stdio transport; the rule
 * is enforced repo-wide).
 */

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  UnconfiguredCredentialResolver,
  type CredentialResolver,
  type ResolvedCredential,
} from "./credential-resolver.js";

const DEFAULT_API_BASE_URL = "https://api.scholarfeed.org/api/v1";
const DEFAULT_CACHE_TTL_MS = 5 * 60_000; // 5 min: short enough that a revoked key stops working quickly
const DEFAULT_TIMEOUT_MS = 10_000;

/** Minimal fetch surface, injectable for tests. */
type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface MintedKeyResolverOptions {
  /** Full URL of the backend resolve-key endpoint. Defaults to {SF_API_BASE_URL}/mcp/resolve-key. */
  provisionUrl?: string;
  /** Shared provisioning secret (X-MCP-Provision-Secret). Defaults to SF_MCP_PROVISION_SECRET. */
  provisionSecret?: string;
  /** Cache TTL for a resolved key, ms. Defaults to SF_MCP_KEY_CACHE_TTL_MS or 5 min. */
  cacheTtlMs?: number;
  /** Per-request provisioning timeout, ms. Defaults to 10s. */
  timeoutMs?: number;
  /** Injected fetch (tests). Defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injected clock (tests). Defaults to Date.now. */
  now?: () => number;
}

interface CacheEntry {
  apiKey: string;
  tier: string;
  expiresAt: number;
}

/** Resolve {SF_API_BASE_URL}/mcp/resolve-key (the endpoint sits on the same base the tools call). */
function defaultProvisionUrl(): string {
  const base = process.env.SF_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  return `${base.replace(/\/+$/, "")}/mcp/resolve-key`;
}

export class MintedKeyCredentialResolver implements CredentialResolver {
  private readonly provisionUrl: string;
  private readonly provisionSecret: string;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(opts: MintedKeyResolverOptions = {}) {
    this.provisionUrl = opts.provisionUrl ?? defaultProvisionUrl();
    this.provisionSecret =
      opts.provisionSecret ?? process.env.SF_MCP_PROVISION_SECRET ?? "";
    if (!this.provisionSecret) {
      throw new Error(
        "MintedKeyCredentialResolver requires SF_MCP_PROVISION_SECRET (the shared " +
          "secret for the backend POST /mcp/resolve-key endpoint).",
      );
    }
    const ttlEnv = Number(process.env.SF_MCP_KEY_CACHE_TTL_MS);
    this.cacheTtlMs =
      opts.cacheTtlMs ??
      (Number.isFinite(ttlEnv) && ttlEnv > 0 ? ttlEnv : DEFAULT_CACHE_TTL_MS);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl =
      opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.now = opts.now ?? Date.now;
  }

  async resolve(auth: AuthInfo): Promise<ResolvedCredential> {
    const extra = (auth.extra ?? {}) as { sub?: unknown; email?: unknown };
    const sub = typeof extra.sub === "string" ? extra.sub : undefined;
    if (!sub) {
      // The verifier already requires `sub`; this is defense in depth.
      throw new Error(
        "Cannot resolve a downstream key: verified token has no sub.",
      );
    }

    const cached = this.cache.get(sub);
    if (cached && cached.expiresAt > this.now()) {
      return { apiKey: cached.apiKey, tier: cached.tier };
    }

    const email = typeof extra.email === "string" ? extra.email : undefined;
    const resolved = await this.fetchKey(sub, email);
    this.cache.set(sub, {
      apiKey: resolved.apiKey as string,
      tier: resolved.tier,
      expiresAt: this.now() + this.cacheTtlMs,
    });
    return resolved;
  }

  /** Call the backend provisioning endpoint. Throws on any failure (mapped to a 501 by the wiring). */
  private async fetchKey(
    sub: string,
    email: string | undefined,
  ): Promise<ResolvedCredential> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let resp;
    try {
      resp = await this.fetchImpl(this.provisionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The provisioning secret. NEVER logged.
          "X-MCP-Provision-Secret": this.provisionSecret,
        },
        body: JSON.stringify({ user_id: sub, email }),
        signal: controller.signal,
      });
    } catch (err) {
      // Network error / timeout. Do not echo err (could carry host/IP); the
      // wiring maps this throw to a generic 501 and logs the cause to stderr.
      const reason = err instanceof Error ? err.name : "unknown";
      console.error(
        "[minted-key-resolver] provisioning request failed:",
        reason,
      );
      throw new Error("MCP key provisioning request failed.");
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      // 401/403 (bad/missing secret), 503 (not configured), 5xx, etc. Surface
      // only the status, never the body (defensive: the body is operator data).
      console.error(
        "[minted-key-resolver] provisioning endpoint returned non-2xx:",
        resp.status,
      );
      throw new Error(`MCP key provisioning returned HTTP ${resp.status}.`);
    }

    let data: unknown;
    try {
      data = await resp.json();
    } catch {
      throw new Error("MCP key provisioning returned a non-JSON body.");
    }

    const obj = data as { api_key?: unknown; tier?: unknown };
    const apiKey = typeof obj.api_key === "string" ? obj.api_key : "";
    if (!apiKey.startsWith("sf_")) {
      // Defensive: never accept a non-sf_ value as the downstream key.
      throw new Error("MCP key provisioning returned no usable sf_ key.");
    }
    const tier = typeof obj.tier === "string" ? obj.tier : "free";
    return { apiKey, tier };
  }
}

/**
 * The default resolver for the remote entry points. Returns a working
 * MintedKeyCredentialResolver when the provisioning secret is configured;
 * otherwise the fail-loud UnconfiguredCredentialResolver, so an undeployed /
 * locally-run server keeps the honest 501 instead of silently doing nothing.
 */
export function createDefaultCredentialResolver(): CredentialResolver {
  if (process.env.SF_MCP_PROVISION_SECRET) {
    return new MintedKeyCredentialResolver();
  }
  return new UnconfiguredCredentialResolver();
}
