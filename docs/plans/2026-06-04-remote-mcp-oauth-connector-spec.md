# Remote MCP + OAuth Connector Build Spec

Date: 2026-06-04
Status: SCOPING (decision-complete, ready for a future BUILD workflow)
Author: synthesized from 6 parallel research agents + repo verification
Scope: ship scholar-feed as a remote Streamable HTTP MCP server with OAuth so it can be added as a connector on claude.ai, the Anthropic Connectors Directory, ChatGPT/OpenAI, and other remote-MCP hosts.

HOUSE NOTE: this doc avoids dashes by style. Where research was uncertain, the assumption and its fallback are stated inline.

---

## 1. Goal and strategic rationale

### Goal
Stand up `https://mcp.scholarfeed.org/mcp`: one spec-compliant remote MCP server (Streamable HTTP transport, MCP spec 2025-11-25) fronted by OAuth 2.1, that reuses the 25 existing tool handlers unchanged and proxies to `api.scholarfeed.org`. The existing stdio npm package stays exactly as-is for local installs; the remote server is an additive second surface.

### Why one build unlocks the whole category
The MCP ecosystem converged in 2025 on a single wire format. Every major hosted assistant now negotiates Streamable HTTP first and accepts an OAuth 2.1 bearer token:

- claude.ai self-add custom connectors and the Anthropic Connectors Directory (claude.com/docs/connectors)
- ChatGPT Apps + the OpenAI Responses API (developers.openai.com/api/docs/mcp)
- Cursor, VS Code / GitHub Copilot, Windsurf / Devin, JetBrains AI, Goose, Perplexity Pro

So the build is: one HTTPS endpoint that speaks POST (client to server JSON-RPC) and GET (server to client SSE), publishes `/.well-known/oauth-protected-resource` (RFC 9728), and validates a bearer token. The per-platform deltas are small and mostly about OAuth client registration (CIMD vs DCR) and submission paperwork, not about the server's core behavior. This is a category unlock, not a per-platform integration: build the server and AS once, then submit to each directory.

### Strategic caveat the operator must hold (see Section 9)
Per MEMORY (broaden-icp-and-instrumentation), the decision to chase broad web reach is explicitly gated on instrumenting usage first. This spec builds the distribution surface. It does NOT instrument usage. Shipping this before interaction instrumentation lands means traffic arrives un-measured, which is the exact tension flagged in `docs/interaction-instrumentation-backend-spec.md`. Recommendation: land minimal per-tool-call instrumentation on the backend in parallel with M1 to M3 so the directory traffic is legible from day one. Treat this as a hard dependency on the value-prop validation, not a nice-to-have.

---

## 2. Target platforms and requirements matrix

Required = hard gate. Optional = works without it. Uncertain = research could not confirm for June 2026; assumption + fallback noted in the cell or Section 9.

| Platform | Transport | Auth | Tool annotations | Submission / review | Extra requirements |
|---|---|---|---|---|---|
| **claude.ai self-add (custom connector)** | Streamable HTTP, required. Old HTTP+SSE deprecated. | OAuth optional. Anonymous bearer (existing SF_API_KEY paste) works. | Not required to function. Helps UX. | None. Paid claude.ai user pastes the URL under Settings > Connectors. | Paid plan only (custom connectors are beta, paid-only). HTTPS. Origin validation. ~150k char result cap, 300s timeout. |
| **Anthropic Connectors Directory** | Streamable HTTP, required. | OAuth 2.1 + PKCE (S256), required for authenticated listing. CIMD preferred; DCR or Anthropic-held creds accepted. | `title`, `readOnlyHint`, `destructiveHint` REQUIRED on all 25 tools per directory policy. | Formal review via clau.de/mcp-directory-submission. Test account, 3 prompt examples, support channel, branding, public doc. No SLA; escalate to mcp-review@anthropic.com. | Privacy + ToS URLs (already live). Health-data checklist item. IP license grant to Anthropic. Removable at any time. |
| **OpenAI / ChatGPT Apps** | Streamable HTTP (SSE backwards-compat accepted). | OAuth 2.1 + PKCE + CIMD/DCR, required. Plain API-key bearer is explicitly BLOCKED for the ChatGPT web connector flow. Responses API (programmatic) still accepts a bearer token. | Read-only hint matters: write connectors gated to Business/Enterprise/Edu; Plus/Pro limited to read-only. | OpenAI Platform identity verification, app metadata, screenshots, test prompts, test account. No SLA; do not request expedited review. | Redirect URI `https://chatgpt.com/connector/oauth/{callback_id}`. Apps SDK (proprietary) only needed for native ChatGPT UI. |
| **Cursor** | Streamable HTTP (`type: http`), required. | OAuth browser flow supported (shipped v1.0, June 2025). | Optional. | None (user adds URL). | None notable. |
| **VS Code / GitHub Copilot** | `type: http` or `sse`, `url` field. GA in 1.102. | OAuth supported (`oauth.clientId`). | Optional. | Optional: list on the GitHub MCP Registry (mcp-publisher CLI + server.json + mcpName in package.json). | None notable. |
| **Windsurf / Devin (Cascade)** | Streamable HTTP + SSE + stdio. | OAuth for all transports. Forwards RFC 8707 `resource` param. | Optional. | None. | None notable. |
| **JetBrains AI** | Streamable HTTP + SSE. | UNCERTAIN: no OAuth mention in official docs as of research date; v2.13.26 (Apr 2026) fixed OAuth bugs. Assume lower maturity; fallback is user-managed config. | Optional. | None. | Treat as best-effort. |
| **Goose (AAIF / Linux Foundation)** | Streamable HTTP / SSE. | OAuth supported. | Optional. | None. | Apache-2.0 client. |
| **Perplexity Pro/Max/Enterprise** | Remote MCP supported. | OAuth. | Optional. | None. | LOW priority: Perplexity announced (Mar 2026) a strategic move away from MCP internally; treat as transient. |
| **Google / Gemini** | SDK-level only (Python/JS), Workspace / Enterprise Agent Platform. | n/a | n/a | No public consumer connector directory analogous to Anthropic/OpenAI. | LOW priority. Out of scope for v1. |

Matrix takeaways:
- The minimum to be usable on the broadest set of hosts is: Streamable HTTP + Origin validation + HTTPS (Section 6, M1).
- The minimum to LIST in either directory is: OAuth 2.1 + PKCE + CIMD/DCR + tool annotations + submission paperwork.
- ChatGPT write-tool exposure is the one hard structural limit (write connectors gated to Business/Enterprise/Edu). Plan to expose read-only tools on the ChatGPT surface first.

---

## 3. Architecture

A single new service (the remote MCP server) acts as an OAuth 2.0 Resource Server (RS). It reuses `registerAllTools()` and the existing tool handlers verbatim, but threads a per-request API key into the HTTP client instead of reading `process.env.SF_API_KEY`. A separate Authorization Server (AS), recommended to be Supabase Auth, issues tokens. The RS validates the token, maps it to a Scholar Feed account, looks up that account's SF_API_KEY server-side, and proxies to `api.scholarfeed.org` with that key. The user's OAuth token is NEVER forwarded to the backend (token passthrough is forbidden by the MCP spec; it is a confused-deputy vector).

### Request flow (text diagram)

```
  Host (claude.ai / ChatGPT / Cursor / ...)
        |
        |  1. POST /mcp  (no token, or expired)
        v
  Remote MCP server (Resource Server)  --->  401 + WWW-Authenticate: Bearer
        |                                       resource_metadata=https://mcp.scholarfeed.org/.well-known/oauth-protected-resource
        |
        |  2. Host reads RFC 9728 metadata -> finds authorization_servers -> reads RFC 8414 metadata on the AS
        v
  Authorization Server (Supabase Auth)
        |  3. OAuth 2.1 auth-code + PKCE(S256), resource=https://mcp.scholarfeed.org/mcp
        |     User logs in (Scholar-Feed-branded consent), AS issues access token
        |     Custom Access Token Hook stamps: aud, sf_user_id, sf_tier
        v
  Host receives access token, retries:
        |  4. POST /mcp  Authorization: Bearer <access_token>   MCP-Protocol-Version: 2025-11-25
        v
  Remote MCP server (Resource Server)
        |  5. validate token sig (JWKS), validate aud == https://mcp.scholarfeed.org/mcp, extract sf_user_id + sf_tier
        |  6. look up that account's SF_API_KEY (Supabase SELECT, cached)
        |  7. registerAllTools handler runs -> client.ts uses the per-request SF_API_KEY
        v
  api.scholarfeed.org  (Authorization: Bearer <SF_API_KEY>, X-SF-Session: <per-request id>)
        |
        v
  corpus / library / watches -> JSON back up the chain -> tool result to host
```

### Stateless vs stateful decision
DECISION: stateless Streamable HTTP for v1 (`sessionIdGenerator: undefined`). All 25 tools are thin REST proxies; account state lives in Supabase / the backend, not in MCP session RAM. Stateless means no session store, no sticky routing, trivial horizontal scale, and GET/DELETE on `/mcp` return 405. The only thing lost is server-initiated push (for example pushing watch alerts to a connected client), which is not a v1 feature. FALLBACK / future: if watch-alert push is wanted, migrate to stateful with `Mcp-Session-Id` and a Durable Object (Cloudflare) or distributed session store. Note GitHub issue #1658: stateful sessions cannot be reconstructed across process restarts, which is another reason to stay stateless now.

---

## 4. Codebase reuse map

Verified against the repo on 2026-06-04. Line numbers below are current.

### Reusable as-is (no change)
- `src/tools/*.ts`: all 25 tool handlers. They call `client.get/post/patch/del` and make zero transport assumptions. Confirmed: every module uses `server.registerTool(name, { description, inputSchema }, handler)`.
- `src/tools/index.ts`: `registerAllTools(server)` (line 57). Transport-agnostic. Runs identically under stdio and Streamable HTTP.
- `src/tools/_untrusted.ts`: `fencePaperContent` helper. Unchanged.
- `src/__tests__/*`: `handlers.test.ts`, `write_tools.test.ts`, `helpers.ts`. The handler suite still validates tool logic under the new transport.
- `scholarfeed.org/privacy-policy` and `/terms-of-service`: already live, satisfy directory requirements.
- `@modelcontextprotocol/sdk ^1.29.0`: already ships `StreamableHTTPServerTransport` (`@modelcontextprotocol/sdk/server/streamableHttp`), `requireBearerAuth` (`@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth`), `mcpAuthMetadataRouter`, and the `WebStandardStreamableHTTPServerTransport` for Workers/Deno/Bun. NO SDK upgrade needed.

### Modify (small, surgical)
- `src/client.ts`: the one substantive change. Today `getApiKey()` (line 30) reads `process.env.SF_API_KEY`; `authHeaders()` (line 41) builds the Bearer header; `getSessionId()` (line 56) memoizes one id per process. For multi-tenant remote use, the API key and session id must be PER-REQUEST, not module-global.
  - Recommended refactor: change `registerAllTools(server)` and each `register(server)` to accept a credential accessor, for example `register(server, getCreds: () => { apiKey: string | null; sessionId: string })`. The stdio entry point passes `() => ({ apiKey: process.env.SF_API_KEY ?? null, sessionId: <process singleton> })`. The HTTP entry point passes a closure that reads the per-request `AuthInfo` (resolved SF_API_KEY) and a fresh per-request session id. This keeps `ScholarFeedClient`'s verb methods unchanged; only header construction reads from the passed creds.
  - LIGHTER alternative if the refactor footprint must stay tiny: use `AsyncLocalStorage` to stash per-request creds and have `authHeaders()` / `getSessionId()` read from it, falling back to env when there is no active context. This touches only `client.ts` and the HTTP entry point. Tradeoff: implicit context vs explicit threading. RECOMMENDATION: explicit `getCreds` threading; it is more testable and avoids ALS edge cases under the SDK's request handling.
- `src/index.ts`: leave as the stdio entry point. Optionally add a `serve` subcommand that boots the HTTP server, OR keep the HTTP server as a fully separate entry file (preferred, see below).

### Net-new
- `src/server-http.ts` (new HTTP entry point): Express (or Hono for Workers) app. Mounts POST `/mcp` (and GET/DELETE returning 405 in stateless mode). Per request: `new McpServer(...)`, `registerAllTools(server, getCreds)`, `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`, `await server.connect(transport)`, `await transport.handleRequest(req, res, req.body)`, close on `res.on('close')`. Wires the bearer-auth middleware and CORS. Estimated 200 to 400 LOC.
- Auth middleware: `requireBearerAuth({ verifier, requiredScopes, resourceMetadataUrl })` with an `OAuthTokenVerifier` implementation that validates the JWT against the Supabase JWKS endpoint, checks `aud`, and returns `AuthInfo { token, clientId, scopes, expiresAt }`. The transport surfaces this to handlers as `ctx.http?.authInfo`.
- Token-to-key bridge: given the validated token's `sf_user_id` (sub) claim, look up the account's SF_API_KEY and tier from Supabase, with a short in-memory cache. ~100 LOC. Injects the key into the `getCreds` closure for that request.
- OAuth discovery endpoints: `mcpAuthMetadataRouter({ oauthMetadata, resourceServerUrl })` mounted at app root: serves `/.well-known/oauth-protected-resource[/mcp]` (RFC 9728) and re-advertises the AS metadata. ~static.
- Tool annotations: add `title`, `readOnlyHint`, `destructiveHint` to all 25 `server.registerTool(...)` config objects (currently NONE have an `annotations` block or a `title`). See Section 5 for the per-tool hint table.
- CORS config: expose `Mcp-Session-Id`, `Last-Event-ID`, `Mcp-Protocol-Version`, `WWW-Authenticate`. Validate Origin (DNS-rebinding guard).
- Supabase Custom Access Token Hook: stamps `aud = https://mcp.scholarfeed.org/mcp`, `sf_user_id`, `sf_tier` onto issued tokens. Backend work, not in this repo.
- OAuth consent UI at `scholarfeed.org/oauth/authorize`: the AS redirects here for the Scholar-Feed-branded consent screen. Backend/web work.
- Deployment infra: a persistent HTTPS host (Section 7). The npm package cannot serve HTTP.
- `package.json`: no `bin` change needed. If a second binary is wanted, add a `serve` subcommand; otherwise deploy `src/server-http.ts` directly from the deployment target's build.

### Tool name length check
Anthropic caps tool names at 64 chars. All 25 current names are well under (longest is `get_foundational_lineage`, 24 chars). PASS, but re-verify programmatically before submission.

---

## 5. OAuth 2.1 design

### Chosen approach: Supabase Auth as the Authorization Server (Option A), RS in the new MCP service
Rationale: the backend is already Supabase (`axqpptygcrgyxftzaeka`); users, subscriptions, and the `is_pro` computed flag already live there. Supabase shipped a public-beta OAuth 2.1 server in November 2025 (supabase.com/docs/guides/auth/oauth-server) covering auth-code + PKCE, OIDC discovery, DCR, JWKS, and Custom Access Token Hooks. Using it means zero new identity store and zero account-sync. The MCP server only has to be a Resource Server: validate tokens and look up the key. This is the lowest-friction path for this stack.

FALLBACK: if the Supabase beta proves insufficient on either of the two known gaps below, switch the AS to WorkOS (has an MCP-specific guide, preserves the Supabase user DB via "Connect") or Auth0 (GA for MCP auth, May 2026). Both support CIMD and are tested against claude.ai/ChatGPT. The RS code (token validation + key bridge) is unchanged; only the JWKS URL and metadata pointers change. Do NOT roll a custom AS (Option C) unless both managed paths fail; auth is the highest security-responsibility surface.

Two known Supabase gaps to validate in M3 before committing:
1. `aud` binding via the Custom Access Token Hook. Supabase's default `aud` is `authenticated` (RLS depends on it). Setting `aud = https://mcp.scholarfeed.org/mcp` must not break existing RLS. ASSUMPTION: issue an MCP-scoped token whose `aud` is the MCP URI, distinct from the standard Supabase session token, via the hook. FALLBACK: if the hook cannot cleanly produce an MCP-audience token, validate `aud` against a custom claim the hook CAN set, or move the AS to WorkOS/Auth0.
2. CIMD support is unconfirmed in the beta; DCR is confirmed. ASSUMPTION for v1: rely on DCR (RFC 7591), which both Anthropic and OpenAI accept. FALLBACK: if a target host requires CIMD, move the AS to WorkOS/Auth0. Track supabase discussion #38022.

### The .well-known endpoints
- On the RS (`mcp.scholarfeed.org`): `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` (RFC 9728), returning `{ resource: "https://mcp.scholarfeed.org/mcp", authorization_servers: ["<supabase issuer>"], scopes_supported: [...] }`. On every unauthenticated request, return `401` with `WWW-Authenticate: Bearer resource_metadata="https://mcp.scholarfeed.org/.well-known/oauth-protected-resource", scope="sf:read"`.
- On the AS (Supabase): `/.well-known/oauth-authorization-server` (RFC 8414) and/or `/.well-known/openid-configuration`. Note Supabase serves these under a `/auth/v1` path prefix, so the standard-path probe may miss; the MCP spec requires clients to try both the RFC 8414 path and OIDC discovery, so this is acceptable. Metadata MUST include `code_challenge_methods_supported: ["S256"]` or clients refuse to connect, and SHOULD include `authorization_response_iss_parameter_supported: true` (RFC 9207).

### Mandatory OAuth behaviors (non-negotiable MUSTs)
- OAuth 2.1 auth-code flow with PKCE, S256 only. No implicit, no ROPC, no client-credentials, no tokens in query strings.
- `resource` parameter (RFC 8707) included in BOTH the authorization and token requests, set to `https://mcp.scholarfeed.org/mcp`. The RS MUST validate the token `aud` matches and reject otherwise.
- HTTPS on all endpoints and redirect URIs.
- Refresh tokens with rotation for public clients (else claude.ai/ChatGPT lose access on expiry). Support `offline_access`.
- Register redirect URIs: `https://claude.ai/api/mcp/auth_callback`, `https://chatgpt.com/connector/oauth/{callback_id}`, and loopback `127.0.0.1:*` (port-agnostic per RFC 8252, for Claude Code). EXACT-match redirect enforcement will break Claude Code's random-port loopback, so wildcard-loopback matching is required.

### Token-to-account mapping and the tier model
- The OAuth token carries `sf_user_id` (sub). The RS looks up that account's SF_API_KEY and tier in Supabase. The RS then calls `api.scholarfeed.org` with that server-held SF_API_KEY, never the user token.
- Tier resolution: the Custom Access Token Hook stamps `sf_tier` (anonymous/free/pro) at issue time. ASSUMPTION: stamp the tier into the token so the RS needs no per-request Supabase round-trip for tier; re-check `is_pro` (live-computed from `subscriptions.current_period_end`) on a short cache TTL so a lapsed trial does not keep Pro access for a full token lifetime. FALLBACK: look up tier per request (adds latency).
- Scope model (the RFC 9728 `scopes_supported`): minimal initial scope `sf:read` for the anonymous-capable read/search tools, then step-up scopes requested when an account tool is first used: `sf:library`, `sf:collections`, `sf:watches`, `sf:pro` (for `embed_text`, `find_gaps`, `ask_library`). Do NOT request all scopes at first consent (scope-inflation anti-pattern the spec warns against).

### Anonymous tier under OAuth
The 9 read/search tools work anonymously today. DECISION: the `/mcp` endpoint accepts UNAUTHENTICATED requests and serves the anonymous-capable tools with no token (anonymous 100/day rate limit), and returns the `401 + WWW-Authenticate` only when an account-scoped tool is called without a valid token. This preserves the "try it with zero setup" property on claude.ai self-add and avoids forcing OAuth just to run a search. NOTE: the Anthropic Directory listing still requires the full OAuth stack to exist; anonymous access and OAuth coexist. (For ChatGPT, OAuth is mandatory for the connector flow regardless.)

### Coexistence with existing SF_API_KEYs
No forced migration. The stdio npm package keeps using `SF_API_KEY` from env, unchanged. OAuth is purely additive on the new remote surface. Returning users link their existing account during OAuth consent (same email = same account); new users get an account provisioned at first authorization. ASSUMPTION: account linking is by email claim. RISK: a user whose claude.ai email differs from their Scholar Feed email needs an explicit link step in the consent UI (Section 9 open decision).

---

## 6. Phased build plan

Milestones are sequenced so M1 is the smallest end-to-end proof and OAuth is staged realistically (discovery metadata before full AS wiring). Parallelizable work is flagged.

### M1: Reachable remote server, anonymous, one host (smallest end-to-end proof)
Tasks:
- New `src/server-http.ts`: Express + `StreamableHTTPServerTransport` (stateless), POST `/mcp`, GET/DELETE -> 405.
- Refactor `src/client.ts` + `registerAllTools` to accept a `getCreds` closure (explicit threading). Stdio path passes the env-based closure; HTTP path passes a closure that, for M1, returns a single server-held SF_API_KEY (or null for anonymous) and a fresh per-request session id.
- Origin validation + CORS (expose the four MCP headers).
- Deploy to the chosen host (Section 7) at a temporary `*.workers.dev` / Railway URL over HTTPS.
ACCEPTANCE: add the URL as a custom connector in claude.ai (paid), call `search_papers` and `get_paper`, get correct results. The handler test suite passes unchanged against the HTTP entry point. NO OAuth yet.
Parallel: none (foundation). Effort: 2 to 3 days.

### M2: Tool annotations + name audit (directory prerequisite, fully parallel to M3)
Tasks:
- Add `title`, `readOnlyHint`, `destructiveHint` to all 25 `registerTool` configs. Hint table:
  - readOnlyHint TRUE (9 + 3 read tools): `search_papers`, `get_paper`, `get_citations`, `fetch_fulltext`, `find_author`, `co_author_graph`, `embed_text`, `get_field_orientation`, `get_foundational_lineage`, `find_gaps`, `ask_library`, `list_library`, `list_collections`, `list_watches`, `check_watches`, `preview_watch`.
  - write, NOT destructive (`destructiveHint: false`): `save_paper`, `like_paper`, `create_collection`, `add_to_collection`, `create_watch`, `update_watch`.
  - destructive (`destructiveHint: true`): `unsave_paper`, `remove_from_collection`, `delete_watch`.
- Programmatic tool-name length check (<= 64).
ACCEPTANCE: every tool exposes a `title` and the correct hints; lint/type passes; names verified. Effort: 0.5 to 1 day.

### M3: Supabase AS validation spike (de-risk OAuth before building, parallel to M2)
Tasks:
- Confirm the Supabase OAuth 2.1 beta on `axqpptygcrgyxftzaeka` exposes RFC 8414 / OIDC discovery with `S256`.
- Prototype the Custom Access Token Hook to stamp `aud`, `sf_user_id`, `sf_tier` WITHOUT breaking existing RLS (the `aud=authenticated` concern). Validate the separate-MCP-token approach.
- Confirm DCR works for an Anthropic/ChatGPT-shaped client; record whether CIMD is available.
ACCEPTANCE: a token minted by Supabase carries the MCP `aud` + custom claims, RLS still works, and the gap list (CIMD?) is resolved into go/no-go for Supabase vs WorkOS/Auth0. This is a SPIKE; its output is a decision, not production code. Effort: 1 to 2 days. If Supabase fails both gaps, swap to WorkOS/Auth0 here (adds ~1 to 2 days).

### M4: OAuth Resource Server: discovery + token validation + key bridge
Depends on M1 (server) and M3 (AS decision). Tasks:
- `mcpAuthMetadataRouter`: serve RFC 9728 protected-resource metadata pointing at the chosen AS.
- `requireBearerAuth` + `OAuthTokenVerifier`: JWKS signature check, `aud` validation, expiry, scope check. 401 + `WWW-Authenticate` on failure.
- Token-to-key bridge: `sf_user_id` -> SF_API_KEY + tier (cached). Inject into the request `getCreds`.
- Wire the anonymous-vs-authenticated split: read tools allowed token-free; account tools require a valid token + scope.
ACCEPTANCE: an account tool (for example `save_paper`) returns 401 with correct `WWW-Authenticate` when called without a token, and succeeds when called with a valid Supabase-issued token whose `aud` is correct; the backend receives the server-held SF_API_KEY, never the user token (verify in backend logs). Effort: 3 to 5 days.

### M5: End-to-end OAuth on a real host + consent UI
Depends on M4. Tasks:
- Build/finish the `scholarfeed.org/oauth/authorize` consent screen (Scholar-Feed-branded, shows scopes + client name).
- Register redirect URIs (claude.ai, chatgpt.com, loopback wildcard). Enable refresh-token rotation + `offline_access`.
- Full flow test from claude.ai: connect -> log in -> consent -> token -> call an account tool.
ACCEPTANCE: a fresh claude.ai user completes OAuth sign-in and successfully calls a Pro-gated account tool; token refresh works after expiry. Effort: 2 to 4 days (much of the consent UI is web/backend work that can run in parallel with M4).

### M6: Production hardening + observability (parallel-friendly, partly overlaps M4/M5)
Tasks:
- Rate-limit the public OAuth surface: `/token` ~5 req/min/IP, `/register` (DCR) ~1 req/min/IP; rate-limit `/mcp` per caller (delegate quota to backend but guard probing).
- Verify SF_API_KEY never appears in tool output, logs, or error messages under the remote transport (the existing `throwApiError` sanitizes 401/403/429; re-verify end to end).
- Structured request logging / metrics; tie into the interaction-instrumentation backend if it has landed (Section 9).
- Custom domain `mcp.scholarfeed.org` + TLS.
ACCEPTANCE: load/abuse probes are throttled; no key leakage in any response path; per-tool-call telemetry visible. Effort: 2 to 3 days.

### M7: Directory submissions (Anthropic first, then OpenAI; serial)
Depends on M2 + M5 + M6. Per Section 8 checklists. Submit Anthropic first (lower risk, write tools allowed), then OpenAI (expose read-only tools first due to write-tool gating). Effort: 1 to 2 days of prep each + open-ended review wait (no SLA).

### Critical path
M1 -> M4 -> M5 -> M7. M2 and M3 run fully in parallel to each other and to M1. M6 overlaps M4/M5. Realistic wall-clock: a usable anonymous custom-connector (M1+M2) in roughly one week; directory-ready with OAuth (through M6) in roughly 3 to 5 weeks, gated mostly on the AS work and the consent UI.

---

## 7. Where it lives + deployment / ops

### Recommended host: Cloudflare Workers (primary), Railway (fallback)
- Cloudflare Workers: native long-lived SSE with no routing timeout, zero cold start, global edge, built-in KV for OAuth/discovery state, `wrangler` secrets, `@cloudflare/workers-oauth-provider` as a first-class primitive, and the `WebStandardStreamableHTTPServerTransport` runs there with no adapter. Cost floor ~$5/month (Workers Paid; only needed if Durable Objects are used, which the stateless design AVOIDS, so the free tier may suffice initially). CAVEAT: Workers is V8 isolates, not Node. `src/client.ts` uses `node:crypto` `randomUUID`; enable `nodejs_compat` in `wrangler.toml` OR swap to WebCrypto `crypto.randomUUID()` (available in Workers). This is the one porting cost.
- Railway (fallback / fastest-to-ship with zero code port): Node Docker container, no routing timeout, ~$2 to $10/month always-on, deploy-from-GitHub, custom domain + auto-TLS. Node runtime means `node:crypto` works unchanged. Single region (no edge), more ops overhead than Workers.
- DO NOT use Heroku for this net-new service: it entered sustaining-engineering (maintenance) mode February 2026, and its router enforces a 30s first-byte and 55s idle-SSE timeout that fights MCP session init. The existing backend staying on Heroku is fine; the new MCP service should be decoupled from it (a second argument for Cloudflare).

DECISION for v1: start on Cloudflare Workers stateless (no Durable Objects) using `createMcpHandler` / `WebStandardStreamableHTTPServerTransport`. If the V8 port friction is unacceptable under time pressure, ship M1 on Railway (Node, zero port) and migrate later; the transport code is the only thing that differs.

### Domain + TLS
`mcp.scholarfeed.org`. OPEN: is `scholarfeed.org` DNS on Cloudflare today? If yes, a Workers Custom Domain is a dashboard click with auto-TLS. If DNS is elsewhere, either delegate the subdomain to Cloudflare or CNAME to the host (Railway/Render) with PaaS-managed TLS. The canonical MCP URI (`https://mcp.scholarfeed.org/mcp`) is the RFC 8707 `resource` value and the token `aud`; decide it BEFORE wiring the Custom Access Token Hook and the RFC 9728 doc, because it is baked into both.

### Rate-limiting / abuse
The OAuth endpoints are a new public attack surface (credential stuffing, token enumeration, DCR phantom-client abuse). Implement `/token` and `/register` throttles BEFORE launch (M6), not after. Quota for tool calls stays delegated to `api.scholarfeed.org` (anonymous 100/day, free 1k/day, Pro 10k/day); the RS passes through 429s.

### Observability
Structured logs (no key/PII leakage), per-tool-call counters, OAuth flow success/failure, and a dashboard. Tie into the interaction-instrumentation backend if landed. This is what makes the directory traffic legible (Section 9).

### ZDR note
The Anthropic MCP connector is NOT eligible for Zero Data Retention. Any enterprise customer with a ZDR agreement must stay on the stdio npm package. Document this.

### Effort summary (engineering days, not wall-clock)
- M1: 2 to 3 | M2: 0.5 to 1 | M3: 1 to 2 (spike) | M4: 3 to 5 | M5: 2 to 4 | M6: 2 to 3 | M7: 1 to 2 prep each + review wait.
- Minimal viable (M1+M2, anonymous custom connector): ~3 to 5 days. Full directory-ready (through M6): ~3 to 5 weeks.

---

## 8. Per-platform submission checklists

### Anthropic Connectors Directory (submit FIRST)
- [ ] Streamable HTTP at `https://mcp.scholarfeed.org/mcp`, POST + GET, Origin validation, HTTPS only.
- [ ] OAuth 2.1 + PKCE (S256), RFC 9728 protected-resource metadata, RFC 8414 AS metadata, RFC 8707 resource param + `aud` validation, refresh tokens.
- [ ] Client registration via DCR (or CIMD if available); register `https://claude.ai/api/mcp/auth_callback` + loopback wildcard.
- [ ] All 25 tools have `title`, `readOnlyHint`, `destructiveHint` (M2 table).
- [ ] Tool names <= 64 chars (verified).
- [ ] Privacy policy URL (scholarfeed.org/privacy-policy) and ToS URL (scholarfeed.org/terms-of-service): already live.
- [ ] Test account with sample data + step-by-step reviewer instructions (must be maintained for re-reviews).
- [ ] 3 working prompt examples demonstrating core functionality.
- [ ] Support channel (email or Discord).
- [ ] Branding: logo (URL or SVG) + favicon. (MCP Apps with UI need 3 to 5 screenshots >=1000px; not applicable unless shipping UI.)
- [ ] Public documentation (blog post or help-center article) live by publish date.
- [ ] Answer the health-data checklist item (Scholar Feed: no).
- [ ] Accept the IP license grant to Anthropic; acknowledge removal-at-any-time.
- [ ] Submit via clau.de/mcp-directory-submission; escalate status to mcp-review@anthropic.com.

### OpenAI / ChatGPT (submit SECOND)
- [ ] Streamable HTTP endpoint (SSE backwards-compat ok).
- [ ] OAuth 2.1 + PKCE + DCR or CIMD (plain API-key bearer is NOT accepted for the connector flow). Register `https://chatgpt.com/connector/oauth/{callback_id}`.
- [ ] DECIDE write-tool exposure: ChatGPT Plus/Pro are limited to read-only connectors; write connectors gated to Business/Enterprise/Edu. RECOMMENDATION: expose the read-only tool subset on the ChatGPT surface for v1; reserve write tools for when OpenAI broadens access.
- [ ] OpenAI Platform identity verification.
- [ ] App metadata: name, logo, description, privacy URL, screenshots, test prompts.
- [ ] Test account with credentials for reviewers.
- [ ] (Optional) OpenAI Apps SDK only if a native ChatGPT embedded-UI experience is wanted; not required for plain MCP interop.
- [ ] Submit via the OpenAI Apps submission flow; no SLA, do not request expedited review.

### Other hosts (no formal review)
- [ ] Cursor, VS Code/Copilot, Windsurf, Goose: nothing to submit; users add the URL. Confirm OAuth browser flow works on each.
- [ ] GitHub / Official MCP Registry (low effort, high distribution to editors): add `mcpName` to `package.json` and a `server.json`, publish via the `mcp-publisher` CLI. DECIDE whether to register the stdio package, the remote server, or both. RECOMMENDATION: both.
- [ ] JetBrains AI, Perplexity: best-effort, low priority; do not block launch on them.

---

## 9. Risks and open decisions

### The instrumentation / ICP tension (call this out loudly)
Per MEMORY (broaden-icp-and-instrumentation, broaden the ICP toward a B2B author/expert-intelligence wedge), the decision to push for broad web reach is explicitly GATED on instrumenting usage first. This spec builds reach. If it ships before per-interaction instrumentation lands on the backend (`docs/interaction-instrumentation-backend-spec.md`), directory traffic arrives un-measured and the operator cannot tell whether the connector validates the value prop or just inflates a vanity number. HARD RECOMMENDATION: land minimal per-tool-call instrumentation in parallel with M1 to M4 (it is partly M6 anyway), and do not submit to the directories (M7) until tool-call telemetry is live. Building distribution ahead of measurement is the precise anti-pattern the ICP-broadening decision was meant to avoid.

### Fast-moving spec (highest external risk)
The MCP authorization spec is a draft and iterated three times in 2025 (2025-03-26, 2025-06-18, 2025-11-25); a 2026-07-28 release candidate is on the roadmap. CIMD replaced DCR as preferred only in Nov 2025. Anthropic's and OpenAI's clients may lag the spec. MITIGATION: implement the non-negotiable MUSTs (RFC 9728, PKCE/S256, `aud` validation, `resource` param), keep SHOULDs in the backlog, pin to the spec version the review process accepts at submission time, and budget ongoing maintenance.

### Open decisions the operator must make BEFORE the build starts
1. AS choice: Supabase Auth (recommended, validate in M3) vs WorkOS/Auth0 fallback. Gated on the M3 spike (aud binding + CIMD).
2. Canonical MCP URI: `https://mcp.scholarfeed.org/mcp` (recommended) vs `api.scholarfeed.org/mcp`. Baked into `aud` and RFC 9728; decide first.
3. Host: Cloudflare Workers (recommended, ~$5/mo, one V8 port cost) vs Railway (zero port, single region). Confirm whether scholarfeed.org DNS is on Cloudflare.
4. Account linking by email: what happens when the host-side email differs from the Scholar Feed email? A consent-time link step is likely needed.
5. Tier in token vs per-request lookup: stamp `sf_tier` in the token (recommended, short cache) vs look up per request. Affects how fast a lapsed trial loses Pro.
6. ChatGPT write-tool exposure: read-only subset for v1 (recommended) vs wait for OpenAI to broaden write access.
7. Stateless now (recommended) vs build stateful for future watch-alert push. Stateless avoids a session store and Durable Object cost; revisit only when push is a real feature.
8. Internal backend credential model: one server-level SF_API_KEY with user identity in a header, vs per-user internal tokens (affects backend rate-limiting and audit granularity). Decide with the backend team.

### Other notable risks
- ChatGPT structural limit: write connectors gated to Business/Enterprise/Edu (no fix in our control).
- Anthropic can remove a listing at any time for any reason; directory ranking is opaque and usage-based. Do not let the business depend on directory traffic.
- Reviewer test account must be maintained indefinitely (or recreated per re-review).
- Per-request key threading: the stateless model creates a fresh server stack per request; the `getCreds` closure must be wired so no handler ever fires without the request-scoped key. The explicit-threading refactor (Section 4) is the guard.
- Confused-deputy / token passthrough: NEVER forward the user OAuth token to `api.scholarfeed.org`. Verify in backend logs (M4 acceptance).
- SDK 2.0 split (`@modelcontextprotocol/server` / `node` / `express`) is at `2.0.0-alpha.2`; 1.29.0 is fine today but a future migration will move the import paths. Pin and revisit.

---

## 10. Recommended NEXT-SESSION build workflow

Structure the build as a Workflow with serial gates around parallel fan-out. Suggested shape:

### Phase 0: Decision lock (serial, operator-in-the-loop, ~30 min)
Resolve the 8 open decisions in Section 9 (especially: canonical URI, AS choice pending M3, host). These are inputs every downstream agent needs; do not fan out until they are pinned. Output: a short DECISIONS.md the build agents read.

### Phase 1: Fan out the independent foundations (parallel, 3 agents)
- Agent A (Transport): build M1 (`src/server-http.ts`, client `getCreds` refactor, stateless transport, CORS/Origin). Owns the handler-suite-passes acceptance.
- Agent B (Annotations): build M2 (25 tool annotations + name audit). Fully independent of A.
- Agent C (AS spike): run M3 against Supabase via the `supabase` MCP (project `axqpptygcrgyxftzaeka`). Pure investigation; output is the AS go/no-go decision that unblocks Phase 2.
These three have no shared files (A touches `client.ts`/new entry, B touches `src/tools/*.ts`, C touches no repo code), so they parallelize cleanly.

### Phase 2: OAuth RS (serial after C's decision, depends on A)
One focused agent builds M4 (discovery router, bearer middleware + verifier, token-to-key bridge, anonymous/authenticated split). This is the highest-stakes security code; keep it single-owner to preserve a coherent threat model rather than fanning it out.

### Phase 3: Integration + hardening (parallel, 2 agents)
- Agent D: M5 end-to-end OAuth + consent UI wiring (much is backend/web; coordinate with backend).
- Agent E: M6 hardening (rate limits, key-leakage audit, observability, custom domain).

### Phase 4: Adversarial verification (serial gate, where it earns its keep)
Before any submission, run a dedicated adversarial-review agent (separate context from the builders) against the security-critical surface:
- Try to make a tool handler fire without a request-scoped key (regression of the threading guard).
- Try to get the user OAuth token forwarded to `api.scholarfeed.org` (token passthrough).
- Try to leak an SF_API_KEY through any tool output, error, or log path.
- Send a token with the wrong `aud` and confirm rejection; send no token to an account tool and confirm the 401 + `WWW-Authenticate`.
- Probe `/token` and `/register` for missing rate limits.
This adversarial pass is where the workflow adds the most value: the builders optimize for "works", the verifier optimizes for "cannot be abused". Gate M7 on it.

### Phase 5: Submissions (serial, operator-in-the-loop)
M7: Anthropic first, then OpenAI, using the Section 8 checklists. Operator handles the human paperwork (test account, branding, prompt examples).

### Agent-role summary
Transport builder, Annotations builder, AS-spike investigator (Supabase MCP), OAuth-RS builder (single owner), Integration/consent builder, Hardening builder, and a separate Adversarial verifier. Fan out Phase 1 and Phase 3; keep Phase 0, 2, 4, 5 serial. The single most important structural choice: keep the OAuth RS single-owner and gate submission on an independent adversarial review.
