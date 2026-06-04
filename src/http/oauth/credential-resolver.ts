/**
 * The token->key bridge SEAM (open backend decision #8).
 *
 * After the verifier validates an OAuth access token, the remote MCP server
 * must obtain a DOWNSTREAM credential to call api.scholarfeed.org with. It MUST
 * NOT forward the user's OAuth token to the backend — that is confused-deputy
 * token passthrough, forbidden by the MCP spec. The backend is only ever called
 * with an `sf_` key (or whatever credential model the backend ultimately
 * chooses), never the user JWT.
 *
 * The spec originally wrote this bridge as "SELECT the account's SF_API_KEY".
 * That is IMPOSSIBLE against the live schema: `api_keys` stores only
 * `key_hash` (SHA-256 of the raw `sf_` key) and the raw key is unrecoverable
 * (verified against scholar-feed/backend/api/auth.py:get_api_key_user, which
 * hashes the inbound token and looks it up — there is no column holding the raw
 * key to read back). So the bridge is a typed SEAM with a fail-loud default;
 * the backend must pick the credential model before this can resolve.
 *
 * The three candidate models (open decision #8) are:
 *   (a) RS mints a per-user `sf_` key on first authorization — needs an
 *       `api_keys` insert PLUS a secure raw-key store (the raw key cannot be
 *       reconstructed from the hash, so it must be retained somewhere safe at
 *       mint time, or re-minted+revoked each session).
 *   (b) A GoTrue admin "act-as-user" JWT with `aud=authenticated`, forwarded to
 *       the backend's existing JWT path (the backend already validates that
 *       audience). The RS would mint this server-side from the verified `sub`.
 *   (c) A single service credential plus a trusted `X-SF-User-Id` header that
 *       the backend reads to attribute the call to the user.
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/**
 * The downstream credential a CredentialResolver produces for one verified
 * request. The HTTP entry point turns this into the per-request creds the
 * client forwards to api.scholarfeed.org.
 *
 * - `apiKey`: the `sf_` key to send as the backend Bearer, or null if the
 *   chosen model carries identity by header instead (model (c)).
 * - `headers`: extra backend headers (e.g. `X-SF-User-Id` for model (c), or an
 *   `Authorization` an act-as-user JWT would occupy for model (b)). Never
 *   contains the user's OAuth token. NOT YET PLUMBED end to end: the HTTP wiring
 *   currently FAILS LOUD (501) if a resolver returns a non-empty `headers`, since
 *   RequestCreds (src/http/credentials.ts) carries only `apiKey`. Extend
 *   RequestCreds + client.ts before adopting a header-bearing model (b)/(c).
 * - `tier`: the resolved tier (anonymous/free/pro) for downstream gating/logging.
 */
export interface ResolvedCredential {
  apiKey: string | null;
  headers?: Record<string, string>;
  tier: string;
}

/**
 * The token->key bridge. Given a verified `AuthInfo` (the OAuth token's mapped
 * claims, including `extra.sub` and `extra.tier`), resolve the downstream
 * backend credential. Implementations MUST NOT return the user's OAuth token as
 * the credential.
 */
export interface CredentialResolver {
  resolve(auth: AuthInfo): Promise<ResolvedCredential>;
}

/**
 * The message the unconfigured default throws. Exported so the wiring layer can
 * surface it in the 501 response and so the test can assert on it verbatim.
 */
export const UNCONFIGURED_RESOLVER_MESSAGE =
  "OAuth token verified, but the backend credential model is not configured " +
  "(open decision #8). Raw sf_ keys are stored ONLY as SHA-256 hashes " +
  "(api_keys.key_hash) and are UNRECOVERABLE, so there is no SELECT that " +
  "returns a usable key for a verified user. The backend must choose one of: " +
  "(a) RS mints a per-user sf_ key on first authorization (needs an api_keys " +
  "insert plus a secure raw-key store); (b) a GoTrue admin act-as-user JWT " +
  "with aud=authenticated, forwarded to the backend's JWT path; or " +
  "(c) a service credential plus a trusted X-SF-User-Id header. Until then, " +
  "OAuth-authenticated account tools cannot reach api.scholarfeed.org.";

/**
 * The default resolver. It THROWS, on purpose: there is no correct way to turn a
 * verified user into a downstream key until the backend picks a model (#8).
 * Failing loud here (mapped to a clear 501 by the wiring) is strictly better
 * than silently inventing a credential or — worse — forwarding the user token.
 */
export class UnconfiguredCredentialResolver implements CredentialResolver {
  // Accepts the auth for interface conformance; intentionally unused — there is
  // nothing to resolve until the backend model lands. The `void auth` keeps the
  // param referenced (no-unused-vars) without an eslint-disable.
  async resolve(auth: AuthInfo): Promise<ResolvedCredential> {
    void auth;
    throw new Error(UNCONFIGURED_RESOLVER_MESSAGE);
  }
}
