# Contributing to Scholar Feed MCP

Thanks for your interest in contributing! This guide covers the basics.

## Setup

```bash
git clone https://github.com/YGao2005/scholar-feed-mcp.git
cd scholar-feed-mcp
npm install
npm run build
```

You'll need an API key from [scholarfeed.org/settings](https://www.scholarfeed.org/settings) to test against the live API.

## Development

```bash
npm run dev        # Watch mode, rebuilds on file changes
npm run typecheck  # Type check without emitting
npm test           # Run tests
```

### Project Structure

```
src/
  index.ts          # Entry point: server setup + init subcommand
  client.ts         # API client wrapper (auth, error handling)
  init.ts           # Interactive setup wizard
  tools/
    index.ts        # Tool registration barrel
    search.ts       # One file per tool
    ...
```

### Adding a New Tool

**First ask whether it should be a tool at all.** Every tool is loaded into *every*
session's context by `tools/list` — currently ~24k tokens for 27 tools — whether that
session uses it or not. A new capability is usually better as a new **parameter on an
existing tool**: `search_papers` already absorbed three former tools this way
(`anchor_paper_id`, `scope_to_citations_of`, `sort='trending'`). Eleven of the 27 tools
logged zero calls over 14 days, so the default assumption should be that a 28th will too.

If it really is a new tool:

1. Create `src/tools/your_tool.ts` following the pattern of existing tools
2. Import and register it in `src/tools/index.ts`
3. Add it to the tool table in `README.md` (and bump the count in the heading)
4. Add tests in `src/__tests__/`: registration in `tools.test.ts`, handler behavior in `handlers.test.ts` (or `write_tools.test.ts` for account-mutating tools)

Each tool file exports a `register(server: McpServer)` function that calls `server.registerTool()` with a name, Zod input schema, and handler.

#### Tool naming

Enforced by `src/__tests__/tool_grammar.test.ts`. A new tool's name **must** start with one
of:

| prefix | meaning |
|---|---|
| `get_` | fetch one identified thing |
| `search_` | query the corpus |
| `list_` | enumerate what belongs to the caller |
| `analyze_` | derived / expensive / interpretive output |
| `ask_` | LLM synthesis over a scoped set |
| `create_` `update_` `delete_` | lifecycle mutations |
| `annotate_` | attach the caller's own judgement to a thing |

`find_` and `check_` are **not** available. They are why this grammar exists: `find_author`
is a search while `find_gaps` is an analysis, and `check_watches` lists while `check_drift`
analyses — so neither prefix tells a caller anything.

Existing names are grandfathered in a **frozen** `LEGACY_NAMES` set because tool names are a
published API (npm, MCP registry, claude.ai connectors). Do not add to that set to make CI
pass — rename your tool, or widen the approved prefixes deliberately and say why in the PR.

#### Writing a tool description

**A tool description must not restate what a parameter's own `description` already says.**
Both are shipped to the client, so duplicated guidance is paid for twice, in every session,
and the two copies drift apart.

This is the single biggest source of description bloat here. `search_papers` had **18 of its
27 parameters documented in both places** — 4,825 chars of parameter text mirrored in prose —
which is how its description reached 4,407 chars. Deduplicating took it to 1,542 with nothing
lost, because every cross-parameter trap removed from the description was verified to already
exist in the parameter that owns it.

So a tool description carries only what **no single parameter can say**:

- what the tool is for, and when to pick it over a neighbouring tool
- limits of the underlying engine (semantic ranking misses old canonical papers)
- how to read the response when no parameter controls it (library state is marked inline)
- honesty about what the data does *not* establish (`check_drift`'s grounding gate verifies
  quote text but not attribution)

Everything parameter-specific — modes, filters, sorts, coverage caveats, response shape —
belongs in that parameter's `.describe()`. Pointing at a parameter is fine; re-explaining it
is not.

A caveat is often a bug you decided to document. Before writing "treat a 0 as unknown", check
whether the field could just return `null`.

#### Surface budget

`src/__tests__/surface_budget.test.ts` holds three ceilings that **may only fall** —
whole-surface, per-tool, and per-description. If your change breaches one, in preference
order: move the text to the parameter that owns it, fit within the budget, subtract something
that is not earning its bytes (run `backend/scripts/tool_usage_report.py` for candidates), or
argue for the raise in the PR.

Ordinary `npm test` output prints the current surface cost, so you can see the effect of a
description edit without hunting for it.

#### Response shapes

`paperObject` in `src/tools/_output.ts` is hand-maintained against a backend in a different
repo, so it drifts. After changing a response shape run `npm run schema:sync` (needs network
+ a live API) to refresh `src/__tests__/fixtures/observed-fields.json`;
`schema_drift.test.ts` then asserts every field the backend actually returns is declared.
Declare each paper array on exactly one envelope — a shared envelope that listed `papers`
*and* `hits` *and* `results` cost ~27k chars of duplicated schema before it was split.

### Code Style

- **Strict TypeScript**: `strict: true`, no `any` unless unavoidable
- **All logging to stderr**: `console.error()` only. `console.log()` corrupts the JSON-RPC stdio transport.
- **ESM imports**: always include `.js` extension in relative imports
- **Zod schemas**: all tool inputs validated with Zod

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes with clear commit messages
3. Run `npm run typecheck` and `npm test` before pushing
4. Open a PR with a description of what changed and why

## Releasing (maintainers)

Publishing to npm is **automated; there is no manual `npm publish`.** The
[`publish.yml`](.github/workflows/publish.yml) workflow publishes on any pushed git
tag matching `v*`, using npm **OIDC trusted publishing** (no stored npm token) with
provenance.

To cut a release from `main`:

```bash
git checkout main && git pull
npm version <patch|minor|major>   # bumps package.json, commits, creates the vX.Y.Z tag
git push --follow-tags            # pushing the tag is what triggers the publish
```

The workflow then runs two jobs:

1. **verify** (unprivileged): asserts the tag matches `package.json` version, then
   `npm run lint` + `npm run build` + `npm test`. A mismatch or a red check blocks the publish.
2. **publish** (the only job granted `id-token: write`): `npm publish --provenance --access public`.

So a release is a version bump plus a tag push, never a hand-run `npm publish`. One-time
registry setup is documented in the `publish.yml` header (npmjs.com → package Settings →
Trusted Publisher: GitHub Actions, `YGao2005/scholar-feed-mcp`, workflow `publish.yml`).

## Reporting Issues

Open an issue on GitHub. For bugs, include:
- Your MCP client (Claude Code, Cursor, Claude Desktop)
- Node.js version (`node --version`)
- The tool call that failed and the error message
