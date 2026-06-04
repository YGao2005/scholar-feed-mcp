# Remote MCP + OAuth — Locked Build Decisions (Phase 0)

Date: 2026-06-04
Companion to: `2026-06-04-remote-mcp-oauth-connector-spec.md`
Status: LOCKED. Build agents read this as ground truth; where it conflicts with the spec, this doc wins (it reflects post-spec verification of the live code).

## Backend reality (verified 2026-06-04 against scholar-feed/backend)

- Backend is **Python FastAPI on Heroku** (`web: uvicorn api.main:app`). DB: Supabase Postgres (asyncpg).
- Auth (`backend/api/auth.py`): the backend ALREADY validates **Supabase JWT (ES256) via JWKS** at
  `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, requires claims `exp/sub/aud`, audience `authenticated`,
  issuer `{SUPABASE_URL}/auth/v1` (gated by `enforce_jwt_issuer`). HS256 is legacy/gated-off.
- The public API also accepts **`sf_` API keys** as Bearer tokens (`require_any_auth` / `optional_any_auth`),
  routing on the `sf_` prefix; `eyJ...` goes to the JWT path. Anonymous (no token) is allowed with lower caps.
- `api_keys` stores only `key_hash` (SHA-256). **Raw `sf_` keys are NOT recoverable from the DB.**

## Three corrections to the spec (consequences of the above)

1. **Cheapest first rung = API-key bearer passthrough (no OAuth).** Because the backend already accepts an
   `sf_` Bearer, the remote server can accept the user's pasted `sf_` key as the Bearer and forward it. This is
   the SAME credential the stdio package uses (the user supplying their own downstream key) — NOT confused-deputy
   token passthrough. It unlocks a working claude.ai custom connector with zero OAuth. The ALS refactor (below)
   yields this for free.
2. **The token->key bridge as the spec wrote it ("SELECT the account's SF_API_KEY") is impossible** — keys are
   stored hashed. Build the bridge as a typed SEAM (`CredentialResolver`) with a default that fails loud and
   documents the open backend decision (#8): (a) RS mints a per-user `sf_` key, (b) GoTrue admin act-as-user
   JWT with `aud=authenticated`, or (c) service credential + `X-SF-User-Id` header. Do NOT fabricate a SELECT.
3. **The OAuth verifier mirrors `backend/api/auth.py` exactly** (ES256/JWKS, require exp/sub/aud, gated issuer)
   but validates `aud` against the MCP resource URI, not `authenticated`. The Custom Access Token Hook that
   stamps that `aud` + `sf_tier` is backend work, OUT OF SCOPE here; the verifier reads its target from env.

## Locked decisions

- **Threading model: AsyncLocalStorage.** `client.ts` reads per-request creds (`apiKey`, `sessionId`) from an ALS
  store set by the HTTP entry point; falls back to `process.env` when no context (preserves stdio + existing tests).
  Rationale: only touches `client.ts` + the new HTTP entry; leaves all 25 tool handlers untouched; stateless v1
  has no server-initiated push so each request->response is fully contained in one async context (the case ALS
  handles correctly). This supersedes the spec's "explicit getCreds threading" recommendation, which would require
  rewriting every `client.*` call site across 14 files and collides with the M2 annotation edits.
- **Transport: stateless Streamable HTTP** (`sessionIdGenerator: undefined`). POST `/mcp`; GET/DELETE -> 405.
- **Host target: runtime-agnostic core + a Node/Express entry point** as the tested default. Reasoning: the backend
  is Python, so the Node MCP server MUST be a separate service (one thin HTTPS hop to `api.scholarfeed.org`); it
  cannot be co-located in FastAPI. Express lets us use the SDK's batteries (`StreamableHTTPServerTransport`,
  `requireBearerAuth`, the auth metadata `router`) and the existing `node --test` harness. Deploy options, cheapest
  first: validate $0 via local + Cloudflare-Tunnel/ngrok; $0 standalone via Cloudflare Workers free tier (documented
  port: `node:crypto` randomUUID -> global `crypto.randomUUID()`); ~$7/mo via a second Heroku dyno (max infra reuse).
  Keep all OAuth/verifier logic framework-agnostic so the Workers port is a thin entry-point swap.
- **Authorization Server: Supabase Auth** (already proven in prod via the backend's JWKS verification). The verifier
  is AS-agnostic via env (`SF_OAUTH_ISSUER`, JWKS URL, `SF_MCP_AUDIENCE`); swapping to WorkOS/Auth0 later changes
  only config. No M3 spike needed to write the code.
- **Canonical MCP URI / resource / token aud: `https://mcp.scholarfeed.org/mcp`** (env `SF_MCP_RESOURCE_URI`).
- **Anonymous coexistence:** `/mcp` serves read/search tools token-free (backend anonymous caps apply); account
  tools return `401 + WWW-Authenticate: Bearer resource_metadata=...` when called without a valid token/scope.

## In scope for THIS repo / this build

- **M1** — transport + ALS creds: `client.ts` ALS refactor; `src/http/credentials.ts` (ALS store); `src/server-http.ts`
  (Express, stateless transport, Origin validation, CORS exposing the MCP headers, per-request creds from `sf_` Bearer);
  `src/index.ts` unchanged (env fallback). HTTP smoke test.
- **M2** — annotations: `title` + `readOnlyHint` + `destructiveHint` on all 25 `registerTool` configs (hint table in
  spec §6 M2); programmatic tool-name length check (<= 64) as a test.
- **M4 (code only, AS-agnostic)** — OAuth Resource Server: `src/http/oauth/verifier.ts` (ES256/JWKS, mirrors auth.py),
  `src/http/oauth/metadata.ts` (RFC 9728 protected-resource doc + `.well-known` routes), `src/http/oauth/credential-resolver.ts`
  (the typed bridge SEAM), bearer-auth wiring + anon/auth split in `server-http.ts`. Verifier + metadata + routing tests.

## OUT of scope here (backend / web / ops / operator)

- M3 Supabase AS spike (live-project investigation); the Custom Access Token Hook (`aud`/`sf_tier` stamping).
- M5 consent UI at `scholarfeed.org/oauth/authorize`; redirect-URI registration; refresh-token rotation config.
- M6 deployment infra, custom domain, OAuth-endpoint rate limits (backend/AS-side).
- M7 directory submissions. **GATE (spec §9): do not submit until per-tool-call instrumentation lands** — broad
  reach is gated on measurement per the `broaden-icp-and-instrumentation` decision. This build is foundation only.

## New dependencies

`express`, `cors` (+ `@types/*`), and `jose` (ES256 JWKS verify via `createRemoteJWKSet` + `jwtVerify`; ESM,
Web-crypto, works in Node and the eventual Workers runtime). `zod` already present. The npm `bin` build
(`tsup src/index.ts`) is unchanged — `server-http.ts` is built by the deploy target, not shipped in the package.

## Adversarial review hardening (applied 2026-06-04, post-build)

A 5-lens adversarial pass (ALS threading, token passthrough, secret leakage, JWT rigor, transport abuse)
confirmed the two highest-stakes properties CLEAN — the user OAuth JWT can never reach the backend
(confused-deputy), and per-request ALS creds never bleed across tenants / never fall back to a server env
key on an anonymous request. The following real findings were then fixed:

- **Empty `SF_MCP_AUDIENCE` failed OPEN.** `??` does not catch `""`, and jose treats a falsy audience as
  "skip" — silently disabling audience binding. The verifier now trims and THROWS on an empty audience.
- **DNS-rebinding: Host header was unvalidated.** Added an `isHostAllowed` guard (env `SF_MCP_ALLOWED_HOSTS`,
  loopback-only when unset) alongside the existing Origin guard. Fixed an IPv6 `http://[::1]` Origin
  false-reject (bracketed hostname).
- **501 body echoed the resolver's `err.message`.** Now only the vetted secret-free Unconfigured message is
  echoed; any other resolver throw returns a generic 501 (full detail to stderr) so a future key-minting
  resolver can't leak a minted key/JWT.
- **Raw network errors leaked the backend host/IP** via `err.cause`. `client.ts` now sanitizes all
  non-timeout fetch failures to a generic message (benefits the stdio path too).
- **OAuth verify-failure logs dumped the unverified decoded JWT** (email/sub via jose `err.payload`). Now
  logs only the error code/name.
- **`SF_API_KEY` on the remote process** is a latent leak — the run-directly entry now FAILS FAST if it is set.
- **`ResolvedCredential.headers`** was silently dropped — the wiring now FAILS LOUD (RequestCreds carries
  only `apiKey`; models b/c must extend it first).

New tests pin these: the ALS no-leak + concurrency invariant over the wire (`http_credentials.test.ts`),
the empty-audience throw, and the Origin/Host guard units. Full suite green (228 tests).

## Remote server environment variables (deploy)

See `.env.http.example`. Security-critical:
- `SF_MCP_ALLOWED_HOSTS` — MUST be set to the public host (e.g. `mcp.scholarfeed.org`) and/or tunnel host on
  any non-loopback deploy, else the server 403s everything (fail closed).
- `SF_MCP_ALLOWED_ORIGINS` — exact browser origins (no trailing slash, never a wildcard); loopback always ok.
- `SF_API_KEY` — MUST be unset on the remote server (it refuses to start otherwise).
- **GA GATE:** set `SF_OAUTH_ENFORCE_ISSUER=true` + `SF_OAUTH_ISSUER` before opening the OAuth path to real
  tokens — once the access-token hook stamps the shared MCP `aud`, the issuer is the only project discriminator.
