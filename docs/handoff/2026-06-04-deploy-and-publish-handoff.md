# Deploy + Publish Handoff (remote MCP server + distribution long-tail)

Date: 2026-06-04
What's built (PRs merged/open): the remote Streamable HTTP MCP server + OAuth RS (merged to main, #12), the Cloudflare Workers port, and the MCPB / Smithery / Docker packaging (this branch). Everything below is an **operator action** — it needs your accounts/auth or is an outward submission, so it was intentionally NOT automated.

---

## A. Deploy the remote server (Cloudflare Workers)

The Workers port (`src/worker.ts` + `wrangler.toml`) is built and proven locally (`wrangler deploy --dry-run` + a live `wrangler dev` smoke). To go live:

```bash
npx wrangler login                 # browser OAuth to your Cloudflare account
npm run worker:dryrun              # no auth — sanity (bundles for the Workers runtime)
npm run worker:deploy              # publishes to https://scholar-feed-mcp.<subdomain>.workers.dev
```

Then set config (the guards fail CLOSED without it):
- **Required:** `SF_MCP_ALLOWED_HOSTS` = the host the Worker answers on. The `*.workers.dev` host is only known after the first deploy, so: deploy once → note the URL → set `SF_MCP_ALLOWED_HOSTS` to that host (uncomment `[vars]` in `wrangler.toml` and redeploy, or set it in the dashboard) → it now accepts real requests.
- **For claude.ai (web):** `SF_MCP_ALLOWED_ORIGINS=https://claude.ai`.
- **Never set `SF_API_KEY`** — the server refuses to use a process-level key (latent cross-tenant leak).

Endpoint = `<workers.dev URL>/mcp`. Add it to claude.ai as an anonymous custom connector and call `search_papers` to confirm.

### Custom domain `mcp.scholarfeed.org` — read this
Your DNS is on **Vercel** (`ns1/ns2.vercel-dns.com`), and `mcp.scholarfeed.org` already resolves to Vercel. Cloudflare Workers Custom Domains require the zone to be **on Cloudflare**, so options are:
- **(c) Easiest — stay on `*.workers.dev`.** claude.ai, Cursor, VS Code, Windsurf, Goose all accept any HTTPS URL. Zero DNS change. Set `SF_MCP_RESOURCE_URI`/`SF_MCP_AUDIENCE` to the workers.dev URL if/when OAuth turns on.
- **(b) Delegate the `mcp` subdomain to Cloudflare** (NS records at Vercel → CF), add `mcp.scholarfeed.org` as a Cloudflare zone, then a Workers Custom Domain. Medium effort.
- **(a) Move the whole `scholarfeed.org` zone to Cloudflare.** Biggest change.

**Blunt alternative:** since your DNS + frontend + the existing `mcp.scholarfeed.org` record already live on **Vercel**, deploying the Node/Express server (`src/server-http.ts`, already built — `npm run dev:http`) to Vercel would give you `mcp.scholarfeed.org` with **zero DNS change**. The Workers port runs fine on `workers.dev` regardless. If the canonical custom domain matters more than edge, Vercel is the lower-friction host here — worth deciding before you wire OAuth (the URL is baked into the token `aud` + RFC 9728 doc).

---

## B. MCPB (Claude Desktop one-click install)

```bash
npm run mcpb:pack                              # -> scholar-feed-mcp.mcpb (~3.2MB, reproducible, gitignored)
npx @anthropic-ai/mcpb sign scholar-feed-mcp.mcpb   # optional; self-signed is fine for a GitHub-release download
```
Publish: attach the `.mcpb` to a GitHub release (tag the version) and/or submit to the Anthropic MCPB directory.
- Polish (optional, non-blocking): the icon is 400×400; `mcpb validate` recommends 512×512 for best Claude Desktop display.

---

## C. Smithery

Go to **smithery.ai/new**, connect `YGao2005/scholar-feed-mcp`; the scanner reads the committed `smithery.yaml` (stdio, optional `SF_API_KEY`, anonymous by default).
- Note: Smithery's June-2026 docs moved to a CLI publish flow (`smithery mcp publish`) and the inline `smithery.yaml` doc page 404s, but the repo-connected `smithery.yaml` format is still scanner-recognized (verified against live examples). If the connect flow rejects it, fall back to their CLI publish with `--config-schema`.

---

## D. Docker MCP catalog

1. (Optional prebuilt) `docker build -t <yourhub>/scholar-feed-mcp .` then push to Docker Hub/GHCR. (Docker's catalog also builds `mcp/<name>` from the repo Dockerfile on their side.)
2. Open the **docker/mcp-registry** PR: fork it, copy `docker-mcp-registry/servers/scholar-feed/server.yaml` → `servers/scholar-feed/server.yaml`, then before submitting:
   - refresh `source.commit` to the real `main` commit (current value is a placeholder from the feature branch),
   - swap `about.icon` (avatar placeholder) for the branded icon URL,
   - re-check `meta.category` against their enum and the optional-`SF_API_KEY` secret modeling with their `task validate`/wizard.

---

## E. The two open directory PRs (post these — I don't auto-comment on external repos)

**Cline #1722** and **punkpeye/awesome-mcp-servers #7329** — ready-to-paste nudges:

> Friendly bump — happy to make any changes that would help this land. The server is live on npm (`scholar-feed-mcp`) and in the official MCP Registry; let me know if anything needs adjusting. Thanks for maintaining this list!

---

## F. Status: done vs left

**Officially live (local track):** npm (3.7.1), Claude Code plugin, official MCP Registry, legal pages.
**Built, ready to submit (this work):** Cloudflare Workers deploy (anonymous reach on claude.ai/Cursor/VS Code/Windsurf/Goose the moment it's deployed), MCPB bundle, Smithery config, Docker image + catalog entry. Cline + punkpeye PRs awaiting maintainer review.

**Still gated on backend work (the big directories + claude.ai account-tier):**
- **OAuth (decision #8 + Supabase Custom Access Token Hook)** — required for claude.ai per-account/Pro access, the Anthropic Connectors Directory, and ChatGPT. The RS code is built and waiting; only the backend credential model + the `aud`/`sf_tier` hook are missing.
- **Instrumentation gate** — your rule was "no directory reach before per-tool-call telemetry." There's now a `usage_events` table (mig 137) + a `usage-analytics` skill reading tool/feature usage. **If that telemetry is live, this gate is already cleared** and the Anthropic/ChatGPT submissions are unblocked (pending the OAuth backend). Confirm before submitting.
