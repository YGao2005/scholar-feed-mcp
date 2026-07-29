# Scholar Feed MCP — Project Instructions

The official MCP server for Scholar Feed (600k+ CS/AI/ML papers). Published to npm as
`scholar-feed-mcp` and hosted remotely at `https://mcp.scholarfeed.org/mcp`.

> Deep dev/release detail lives in `CONTRIBUTING.md` and `docs/` — this file is the load-bearing
> guardrails. When they conflict, fix the drift.

## What this repo is (and isn't)

- A **thin MCP client**. It exposes tools (search, citations, lineage, library, watches, …) and
  forwards to the **real backend, which is a SEPARATE repo** (`../scholar-feed`, FastAPI on Heroku
  + Supabase). Client tools routinely ship **ahead** of the backend routes they call — a tool can
  exist here before its endpoint is live in prod.
- Do **not** put business logic, DB access, or scoring here. If a tool needs new data, the change
  is usually a backend serializer/route in `../scholar-feed`, then a thin tool here.

## Architecture — three transports, one tool set

| Entry | File | Used by |
|---|---|---|
| **stdio** | `src/index.ts` (the npm `bin`) | local `npx scholar-feed-mcp`, Claude Desktop/Code |
| **HTTP (Express)** | `src/server.ts` → `src/server-http.ts` | the remote endpoint on Vercel (`mcp.scholarfeed.org`) |
| **Cloudflare Worker** | `src/worker.ts` | edge deploy (`npm run worker:deploy`) |

Tools live in `src/tools/` (one file per tool, registered in `src/tools/index.ts`).
`src/client.ts` is the backend API wrapper (auth + error handling).

## 🔴 Hard rules

- **Publishing is AUTOMATED — never run `npm publish` by hand.** `publish.yml` publishes on a
  pushed `v*` tag via npm OIDC trusted-publishing (no token, with provenance). Release from `main`:
  `npm version <patch|minor|major>` then `git push --follow-tags` — **the tag push IS the publish**.
  (Assistant may prepare the bump+tag; the human pushes.) See `CONTRIBUTING.md` → Releasing.
- **All logging to stderr (`console.error`).** `console.log()` corrupts the JSON-RPC stdio
  transport and silently breaks the client.
- **Keep the package self-contained: `dependencies` must stay `{}`.** tsup bundles everything
  (deps → devDeps) so cold-start `npx` is ~1 pkg / 0 transitive installs. Adding a runtime dep
  re-introduces the cold-start timeout that shipped as a silent "failed to connect".
- **The remote endpoint is `src/worker.ts` (Cloudflare), not the Express server.** The historical
  trap here was Vercel zero-config auto-detecting the **stdio** bin and 500'ing the endpoint for two
  days, which `vercel.json` existed to prevent. Vercel is gone as of 2026-07-29, so `vercel.json` is
  now dead config (kept, unused). `src/server.ts` / `src/server-http.ts` still back `npm run
  dev:http` for local HTTP testing — don't delete them, but don't expect them to serve prod.
  `SF_MCP_ALLOWED_HOSTS` is **required** for any non-loopback deploy: unset = loopback-only, which
  rejects every real request. Never set `SF_API_KEY` on the remote surface (cross-tenant leak — each
  request derives its own key from the Authorization header).

## Deploy

- **Remote endpoint: Cloudflare Workers** — `npm run worker:deploy` from this repo (deploys
  `src/worker.ts` → `mcp.scholarfeed.org`). This is a **manual** deploy, NOT auto-on-push: pushing
  `main` no longer ships the endpoint. Was Vercel until 2026-07-29, when the account was cancelled
  (see `../scholar-feed` CLAUDE.md). `main` is still the prod branch and the `test` status check is
  still required (docs-only changes need `gh pr merge --admin`).
  Needs Node ≥22 for wrangler 4 — use `mise exec node@24 -- npm run worker:deploy` if your shell
  default is older. `npm run worker:dryrun` bundles without auth to prove it compiles.
- **npm:** tag-triggered (above). **MCP Registry:** `server.json` is auto-synced to the npm version
  by the release workflow (keep them from drifting).

## Code style (strict)

- **Strict TypeScript** (`strict: true`); avoid `any`.
- **ESM**: relative imports always include the `.js` extension.
- **Zod** for every tool's input schema.
- **Output schemas**: every tool declares `outputSchema` AND returns `structuredContent`
  (`src/tools/_output.ts`) — the SDK throws if a schema is declared without it (Smithery gate).
- **Tool names must match `^[a-zA-Z0-9_-]{1,128}$`** — no dots (dots → `invalid_request_error` on
  claude.ai, the live surface).
- **Prompt-injection fencing**: paper content is untrusted third-party data — wrap it via the
  shared `tools/_untrusted.ts` fencing; never let tool output instruct the model.

## Testing & CI

```bash
npm run typecheck && npm test     # run BEFORE pushing
npm run coverage                  # c8 gate (.c8rc.json floors)
npm run format                    # prettier — fixes the format:check CI gate
```

- `format:check` (prettier) is a **CI gate that has shipped RED before** — run `npm run format`
  if it fails rather than hand-fixing.
- Add a tool → register in `src/tools/index.ts`, add to the README tool table (+ bump the count),
  and add tests in `src/__tests__/` (`tools.test.ts` registration + `handlers.test.ts` /
  `write_tools.test.ts` behavior).

## Pointers

- `CONTRIBUTING.md` — full dev loop, project structure, adding tools, releasing.
- `docs/` — handoffs, deploy runbooks, AEO/distribution playbooks.
- Backend + frontend + planning all live in `../scholar-feed` (see its `CLAUDE.md`).
