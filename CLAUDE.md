# Scholar Feed MCP — Project Instructions

The official MCP server for Scholar Feed (600k+ CS/AI/ML papers). Published to npm as
`scholar-feed-mcp` and hosted remotely at `https://mcp.scholarfeed.org/mcp`.

> Deep dev/release detail lives in `CONTRIBUTING.md` and `.local-docs/` — this file is the
> load-bearing guardrails. When they conflict, fix the drift.
>
> **This repo is PUBLIC.** Internal specs, handoffs, runbooks, and launch/distribution material
> go in `.local-docs/` (gitignored), never in a tracked path. Only user-facing docs — `README.md`,
> `CONTRIBUTING.md` — are published.

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
  days, which `vercel.json` existed to prevent. Vercel is fully gone as of 2026-07-30: the account
  was cancelled, `vercel.json` is deleted, and the GitHub integration is uninstalled (it had been
  red-failing every PR with "deployment blocked"). If a `Vercel` check ever reappears on a PR, the
  app got reinstalled — uninstall it rather than re-adding config. `src/server.ts` /
  `src/server-http.ts` still back `npm run
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

## 🔴 The tool surface is budgeted

`tools/list` is a **fixed cost every session pays before any work** (~24k tokens for 27
tools). Three gates hold it, all in `src/__tests__/`:

- **`surface_budget.test.ts`** — whole-surface, per-tool and per-description ceilings that
  **MAY ONLY FALL**, plus a guard that no envelope declares two paper arrays. `npm test`
  prints the current cost every run.
  **Never restate a param's own `description` in the tool description** — both ship to the
  client, so it is paid for twice and drifts. That one mistake made `search_papers`
  4,407 chars (18 of 27 params documented twice); it is 1,542 now with nothing lost. A tool
  description carries only what no single param can say.
- **`tool_grammar.test.ts`** — a new tool must use an approved prefix (`get_` `search_`
  `list_` `analyze_` `ask_` `create_` `update_` `delete_` `annotate_`). `find_` and `check_`
  are banned as ambiguous. The 27 published names are grandfathered in a **frozen** set —
  **do not add to it to make CI pass**, that is the same rubber stamp as bumping
  `ALL_TOOLS.length`.
- **`schema_drift.test.ts`** — every field the backend returns must be declared. Refresh the
  fixture with `npm run schema:sync` after any response-shape change.

**Prefer a new PARAMETER over a new tool.** `search_papers` absorbed three former tools that
way. This consolidation already happened once (see the v3 note in `src/tools/index.ts` — 11
tools deregistered) and the surface grew straight back, which is why the gates exist.
`backend/scripts/tool_usage_report.py` names subtraction candidates; read its `mcp` column,
never the total (`get_paper`'s 91k/14d is crawler traffic).

## Pointers

- `CONTRIBUTING.md` — full dev loop, project structure, adding tools, releasing.
- `.local-docs/` — handoffs, deploy runbooks, AEO/distribution playbooks. Gitignored: this repo
  is public, so these stay local. Do not move them back into a tracked path.
- Backend + frontend + planning all live in `../scholar-feed` (see its `CLAUDE.md`).
