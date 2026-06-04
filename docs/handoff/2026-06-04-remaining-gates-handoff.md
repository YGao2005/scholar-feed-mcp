# Remaining Gates — Fresh-Session Handoff

Date: 2026-06-04
Read this + the auto-loaded memory, then pick a gate below. Reference spec:
`docs/plans/2026-06-04-remote-mcp-oauth-connector-spec.md` (§5 OAuth, M3/M4/M5) and
`docs/plans/2026-06-04-remote-mcp-DECISIONS.md` (locked decisions + the 3 backend corrections).
Publish/submission commands: `docs/handoff/2026-06-04-deploy-and-publish-handoff.md`.

## State as of this handoff
- Remote Streamable HTTP MCP server + OAuth Resource Server: **merged to `main`** (#12).
- Cloudflare Workers port + MCPB/Smithery/Docker packaging: **PR #13** (merge it first).
- 228 tests green. Validated live in claude.ai (anonymous search). **Not deployed to a persistent host yet.**
- Operator: Claude **Max** (custom connectors are paid-gated — Max qualifies). Goal is **passive ~$1k MRR, low-maintenance** — prioritize accordingly (see the strategic note at the bottom).
- Backend = Python FastAPI on Heroku; Supabase project ref `axqpptygcrgyxftzaeka`. The OAuth gate is mostly **backend + Supabase work, in `discord-bots-workspace/scholar-feed/backend`**, not this repo.

---

## Gate 1 — Deploy the remote server (unlocks anonymous reach; LOW maintenance, do first)

### ✅ DONE 2026-06-04 — live at https://mcp.scholarfeed.org/mcp (Vercel)
- **Verified:** anonymous `search_papers` returns real papers over `https://mcp.scholarfeed.org/mcp`; `initialize` + `tools/list` + the RFC 9728 metadata route all work; Host guard pins `mcp.scholarfeed.org`; Origin guard allows `https://claude.ai`, 403s others. serverInfo version 3.7.1.
- **How it's deployed:** Vercel project `ygao2005s-projects/scholar-feed-mcp` (git-connected to the GitHub repo, prod branch = `main`). New entrypoint **`src/server.ts`** — a thin Express file Vercel's Node/Express detection captures (it must `import express` *in the entrypoint file itself*, then mounts `createApp({enableJsonResponse:true})` at `/`; createApp alone is NOT detected). JSON-response mode is on (serverless has no `res.on("close")` lifecycle). The `import.meta.url===argv[1]` run-directly guard does NOT fire on Vercel, so the SF_API_KEY leak-check + host warning + listen run unconditionally in `src/server.ts`.
- **Prod env (Production scope only):** `SF_MCP_ALLOWED_HOSTS=mcp.scholarfeed.org`, `SF_MCP_ALLOWED_ORIGINS=https://claude.ai`. **`SF_API_KEY` is NOT set** (must stay unset). `SF_API_BASE_URL` unset → defaults to prod. Preview/dev env scopes are unset (preview deploys will 403 every request — expected).
- **Deployed via CLI** (`vercel deploy --prod`) from the `feat/distribution-workers-longtail` branch (commit 52ae74a, pushed → PR #13). ⚠️ **`src/server.ts` is NOT on `main` yet** — until PR #13 merges, a git-integration push to `main` would build with "No entrypoint found" (a failed build is NOT promoted, so the live alias stays up — but new git-triggered prod deploys won't work until the merge). **Merge PR #13 to keep git-integration prod deploys green.**
- **Operator action still open:** add `https://mcp.scholarfeed.org/mcp` to claude.ai as an anonymous custom connector and confirm in-product (the server side is verified; only the in-app connector add is left).

### Original plan (kept for reference)
Decision: host. The domain is on **Vercel** and `mcp.scholarfeed.org` already resolves there; operator is unsure about Cloudflare. → **Recommend Vercel**, zero DNS change.
- Deploy the already-built `src/server-http.ts` (Express app, exported as `app`/`createApp()`) as a **Vercel Node serverless function** and route `mcp.scholarfeed.org` → it. Prefer JSON-response mode on serverless (as `src/worker.ts` does via `enableJsonResponse`) to avoid SSE-teardown issues; the WebStandard `worker.ts` handler also adapts to Vercel Edge if you want edge.
- Env to set: `SF_MCP_ALLOWED_HOSTS=mcp.scholarfeed.org`, `SF_MCP_ALLOWED_ORIGINS=https://claude.ai`. `SF_API_BASE_URL` defaults to prod. **Do NOT set `SF_API_KEY`.** Caveat: the `SF_API_KEY` fail-fast lives in `server-http.ts`'s run-directly guard, which a serverless `import { app }` does NOT trigger — so either keep `SF_API_KEY` unset in the Vercel env (it must be), or move that guard into `createApp()` so the leak-check fires on serverless too.
- Lean on the installed Vercel skills: `vercel:deploy`, `vercel:vercel-functions`, `vercel:ai-sdk` (has MCP guidance), `vercel:env`.
- **Verify:** add `https://mcp.scholarfeed.org/mcp` to claude.ai as an anonymous custom connector → `search_papers` returns real papers.
- Fallback: `npm run worker:deploy` to Cloudflare `*.workers.dev` (no custom domain). Document the ZDR caveat (the Anthropic connector is not ZDR-eligible; ZDR customers stay on the stdio package).

## Gate 2 — Confirm the instrumentation gate (CHEAP, do early — it may already be cleared)

Operator's own rule: no directory reach before per-tool-call telemetry. There's now a `usage_events` table (mig 137) + a `usage-analytics` skill. Run `/usage-analytics` (or query `usage_events` on `axqpptygcrgyxftzaeka`) to confirm tool/feature usage is being recorded. **If live → the gate is cleared** and the big-directory submissions (Gate 4) are unblocked once Gate 3 lands. If not, that instrumentation is the prerequisite.

## Gate 3 — OAuth backend (BIG; unlocks claude.ai account-tier + Anthropic/ChatGPT directories; HIGHER maintenance)

This is the real blocker. Mostly backend + Supabase. Three pieces:

1. **Decision #8 — the credential model** (how the RS acts as a verified user; raw `sf_` keys are stored hashed/unrecoverable). Options:
   - (a) RS mints a per-user `sf_` key on first authorization (api_keys insert + a secure raw-key store);
   - (b) GoTrue admin "act-as-user" JWT with `aud=authenticated`, forwarded to the backend's existing JWT path; **← evaluate first** (reuses the backend's proven JWT validation, no new key store);
   - (c) service credential + a trusted `X-SF-User-Id` header.
   Then implement the chosen model as a real `CredentialResolver` in this repo (replace `UnconfiguredCredentialResolver`). **If (b)/(c) need extra backend headers, also extend `RequestCreds` + `client.ts`** — they're `apiKey`-only today, and `resolve-creds.ts` deliberately FAILS LOUD if a resolver returns headers.

2. **Supabase Custom Access Token Hook** (project `axqpptygcrgyxftzaeka`): stamp `aud=<MCP resource URI>` + `sf_tier` onto MCP-scoped tokens WITHOUT breaking existing RLS (which depends on `aud=authenticated`) — validate the separate-MCP-token approach (spec M3). Then set the RS env: `SF_OAUTH_ISSUER`, `SF_OAUTH_JWKS_URL` (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`), `SF_MCP_RESOURCE_URI`/`SF_MCP_AUDIENCE`, and `SF_OAUTH_ENFORCE_ISSUER=true` once the live `iss` is confirmed. The verifier (`src/http/oauth/verifier.ts`) already validates all of this — it just needs real tokens to validate.

3. **Consent UI + client registration** (spec M5): `scholarfeed.org/oauth/authorize` (Scholar-Feed-branded), register redirect URIs (`https://claude.ai/api/mcp/auth_callback`, the chatgpt callback, loopback wildcard for Claude Code), refresh-token rotation + `offline_access`.

Acceptance: a fresh claude.ai user completes OAuth and calls a Pro-gated account tool; the backend receives the server-held credential, NEVER the user JWT (verify in backend logs).

## Gate 4 — Submissions (operator paperwork; after 1–3)

Per `docs/handoff/2026-06-04-deploy-and-publish-handoff.md`: MCPB release, Smithery connect, Docker `docker/mcp-registry` PR, the two PR nudges (Cline #1722, punkpeye #7329) — none gated. The **Anthropic Connectors Directory** (submit first) and **ChatGPT** need Gate 3 done + Gate 2 confirmed.

---

## Strategic note (passive ~$1k MRR, low-maintenance)
- **Gate 1 is the clear win:** anonymous reach across claude.ai/Cursor/VS Code/Windsurf/Goose, inbound, low-maintenance. Do it regardless.
- **Gate 3 (OAuth) is the high-maintenance one** (consent UI, refresh tokens, a reviewer test account maintained indefinitely, fast-moving spec). It's justified IF claude.ai is a real paid-conversion channel (it gives account-tier + the Directory listing). Sequence it deliberately.
- **Consider deferring ChatGPT** specifically: write tools are gated to Business/Enterprise/Edu there, and the review is heavy — low ROI for a solo passive operator vs. the Anthropic Directory.
- Don't let the business depend on directory traffic (rankings are opaque, listings removable at will).
```
Kick off the fresh session with, e.g.:
  "Read docs/handoff/2026-06-04-remaining-gates-handoff.md, then do Gate 1 (deploy server-http.ts to Vercel on mcp.scholarfeed.org)."
```
