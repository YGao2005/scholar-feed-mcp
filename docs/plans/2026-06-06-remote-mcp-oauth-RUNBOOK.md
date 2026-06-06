# Remote MCP OAuth Connector - Activation Runbook

Date: 2026-06-06
Companion to: `2026-06-04-remote-mcp-oauth-connector-spec.md` + `2026-06-04-remote-mcp-DECISIONS.md`
Credential-bridge model: **(a) per-user minted sf_ keys** (locked 2026-06-06; chosen for long-term robustness: least privilege, strict no-passthrough, AS-portable, reuses the existing sf_-key machinery).

This runbook covers the steps the OPERATOR must do (dashboard config, secrets, deploys, E2E, submission). The code + DB work is DONE (see "What is already done").

---

## What is already done (code + prod DB)

Three branches, all green (typecheck/lint/tests/build), NOT yet merged/deployed:

- **scholar-feed `feat/mcp-oauth-connector`** (worktree `../sf-mcp-oauth`):
  - `mig 138 mcp_oauth_keys` (encrypted per-user key store) + `mig 139 custom_access_token_hook` - **BOTH APPLIED TO PROD `axqpptygcrgyxftzaeka` + verified** (hook stamps dual-aud only on OAuth tokens; table RLS-on no-policy). They are INERT until the hook is registered + the endpoint is deployed.
  - `POST /api/v1/mcp/resolve-key` (`routers/mcp_provision.py`) + config `SF_MCP_PROVISION_SECRET` / `SF_MCP_KEY_ENC_SECRET`. 8 tests.
  - Frontend `/oauth/consent` + `/api/oauth/decision`.
- **scholar-feed-mcp `feat/mcp-oauth-resolver`** (worktree `../sf-mcp-oauth-rs`):
  - `MintedKeyCredentialResolver` + `createDefaultCredentialResolver()` wired into `server-http.ts`. 10 tests. (Worker variant left honest-501; the live prod is Vercel/Express.)

The RFC 9728 metadata already emits `authorization_servers` from `SF_OAUTH_ISSUER` (no code change) - it is just unset on the live deploy today.

---

## Step 0 - Generate the two secrets (local)

```bash
openssl rand -hex 32   # -> SF_MCP_PROVISION_SECRET  (shared: backend AND the MCP RS)
openssl rand -hex 32   # -> SF_MCP_KEY_ENC_SECRET    (backend ONLY; encrypts raw keys at rest)
```

Keep both in your secret manager. Rotating `SF_MCP_KEY_ENC_SECRET` later orphans existing ciphertexts; resolve-key self-heals by re-minting on the next call (one extra mint per user), so rotation is safe but not free.

---

## Step 1 - Deploy the backend (Heroku)

Migrations 138/139 are ALREADY applied to prod, so this is a code-only deploy.

```bash
heroku config:set \
  SF_MCP_PROVISION_SECRET=<from step 0> \
  SF_MCP_KEY_ENC_SECRET=<from step 0> \
  --app <backend-app>

# Precondition (always): CORS_ORIGINS must contain no "*"
heroku config:get CORS_ORIGINS --app <backend-app>

# Deploy the feat/mcp-oauth-connector backend (subtree push, per CLAUDE.md)
git subtree split --prefix backend -b heroku-deploy
git push heroku heroku-deploy:main --force
```

Verify (no secret -> 403; the endpoint exists and is guarded):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://api.scholarfeed.org/api/v1/mcp/resolve-key \
  -H 'Content-Type: application/json' -d '{"user_id":"x"}'   # expect 403
```

---

## Step 2 - Deploy the frontend consent UI (Vercel)

The consent UI is on the SAME branch as the backend (`feat/mcp-oauth-connector`).
Merge it to `master`; Vercel auto-deploys prod. Run `next build` in an isolated
worktree first (per CLAUDE.md) and confirm `/oauth/consent` + `/api/oauth/decision`
are in the route list (already verified on the branch).

After deploy: `https://www.scholarfeed.org/oauth/consent` should render
"Something went wrong / missing identifier" when hit with no `authorization_id`
(proves the route is live and not 404).

---

## Step 3 - Enable the Supabase OAuth 2.1 server (dashboard)

Project `axqpptygcrgyxftzaeka` -> Authentication.

1. **OAuth Server**: toggle **Enable OAuth 2.1 server** (public beta, free).
2. **Authorization Path**: set to `/oauth/consent`.
3. **URL Configuration > Site URL**: confirm `https://www.scholarfeed.org`
   (the consent URL is Site URL + Authorization Path).
4. **Enable Dynamic Client Registration (DCR)**: REQUIRED - claude.ai registers
   itself + its redirect URI (`https://claude.ai/api/mcp/auth_callback`) via DCR.
   (Caution: DCR lets any client register. The consent screen still gates every
   authorization; monitor registered clients.)

Verify the discovery endpoint now answers (it 404s today):

```bash
curl -s https://axqpptygcrgyxftzaeka.supabase.co/.well-known/oauth-authorization-server/auth/v1 | head -c 400
# expect JSON with authorization_endpoint, token_endpoint, code_challenge_methods_supported:["S256"]
```

---

## Step 4 - Register the Custom Access Token Hook (dashboard)

Authentication > **Hooks** > **Custom Access Token** > select
`public.custom_access_token_hook` (already deployed by mig 139) > enable.

SAFETY CHECK after enabling (the hook touches only OAuth tokens, but verify the
web app is unaffected):

- Sign in to `https://www.scholarfeed.org` normally; confirm login still works
  (web-session tokens have no `client_id` -> hook returns them unchanged, `aud`
  stays `authenticated`). Re-run after Step 6 to confirm OAuth tokens get the
  dual-aud.

---

## Step 5 - Deploy + configure the MCP Resource Server (Vercel, mcp.scholarfeed.org)

Merge `feat/mcp-oauth-resolver` to `scholar-feed-mcp` `main` (Vercel auto-deploys
prod; keep `vercel.json` builds -> `src/server.ts`). Set the MCP project env:

```
SF_MCP_PROVISION_SECRET   = <same value as the backend, from step 0>
SF_OAUTH_ISSUER           = https://axqpptygcrgyxftzaeka.supabase.co/auth/v1
SF_OAUTH_JWKS_URL         = https://axqpptygcrgyxftzaeka.supabase.co/auth/v1/.well-known/jwks.json
SF_MCP_AUDIENCE           = https://mcp.scholarfeed.org/mcp
SF_MCP_RESOURCE_URI       = https://mcp.scholarfeed.org/mcp
SF_OAUTH_ENFORCE_ISSUER   = true     # GA gate: enforce iss once the hook stamps the shared aud
SF_MCP_ALLOWED_HOSTS      = mcp.scholarfeed.org
# SF_API_KEY must remain UNSET on this server (it refuses to start otherwise)
```

Verify the metadata now advertises the AS (today it omits `authorization_servers`):

```bash
curl -s https://mcp.scholarfeed.org/.well-known/oauth-protected-resource
# expect authorization_servers: ["https://axqpptygcrgyxftzaeka.supabase.co/auth/v1"]
```

---

## Step 6 - End-to-end test (as a custom connector in claude.ai, paid)

1. Settings > Connectors > Add custom connector > `https://mcp.scholarfeed.org/mcp`.
2. **Anonymous read** still works with no auth (e.g. `search_papers`).
3. Call an **account tool** (e.g. `save_paper`). Claude should start OAuth:
   discovery -> DCR -> redirect to `/oauth/consent` -> sign in -> **consent
   screen shows "Claude wants to connect..." + the scopes** -> Authorize ->
   tool succeeds **as your account**.
4. Confirm the key was minted + the call attributed to you:

```sql
-- one row per OAuth user, linked to a live api_keys row
SELECT m.user_id, m.created_at, m.last_resolved_at, k.name, k.revoked_at
FROM mcp_oauth_keys m JOIN api_keys k ON k.id = m.api_key_id
ORDER BY m.created_at DESC LIMIT 5;
-- and the tool call shows up in usage_events / api_key_usage for that key
```

5. Confirm the OAuth token carries the dual-aud (decode the access token Claude
   received, or check via a debug log): `aud` should include both
   `authenticated` and `https://mcp.scholarfeed.org/mcp`.
6. Revocation: revoke the `mcp-oauth-connector` key in Settings; confirm account
   tools start failing within the RS cache TTL (default 5 min).

If an account tool returns **501** (not 401), the RS lacks `SF_MCP_PROVISION_SECRET`
or the backend endpoint is unreachable - recheck Steps 1 + 5.

---

## Step 7 - Submit to the Anthropic Connectors Directory

Use spec section 8. Prerequisites now satisfied: Streamable HTTP, OAuth 2.1 +
PKCE (S256) + DCR, RFC 9728 metadata with `authorization_servers`, `aud`
validation, refresh tokens (Supabase), tool annotations (already on all 25
tools), privacy + ToS URLs (live). Provide:

- A **test account** with seeded library/collections/watches (reviewers call
  every tool; account tools must work for their authed session).
- 3 working prompt examples, a support channel, branding/logo.
- Submit via `clau.de/mcp-directory-submission`; escalate to mcp-review@anthropic.com.

GATE (spec section 9): per-tool-call instrumentation is LIVE (`usage_events`,
mig 137) + OAuth/MCP traffic now lands in `api_key_usage` per user via the
minted key, so the "do not submit before measurement" gate is satisfied.

---

## Gotchas / notes

- **WAF / bot-blocking** must NOT block Anthropic on the OAuth + metadata + token
  paths (`/.well-known/*`, the Supabase `/auth/v1/oauth/*`). The Vercel/Express
  deploy serves `.well-known/*` openly today; re-verify after any firewall change.
- **GA gate**: keep `SF_OAUTH_ENFORCE_ISSUER=true` once real tokens flow - after
  the hook stamps the shared MCP `aud`, the issuer is the only project discriminator.
- **Worker variant** (`src/worker.ts`) is intentionally left at the honest-501
  (its default resolver is still Unconfigured) because the minted-key resolver
  reads `process.env`, not Workers env bindings. Live prod is Express, so this is
  fine; if you ever move the OAuth-enabled remote to Workers, wire a resolver
  from the Workers `env`.
- **Backend never sees the user OAuth token.** Model (a) forwards a per-user sf_
  key; the user JWT never leaves the RS (confused-deputy guard preserved).
- **One live key per user.** resolve-key revoke-and-replaces; the user sees a key
  named `mcp-oauth-connector` in Settings and can revoke it.
