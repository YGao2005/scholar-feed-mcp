# Scholar Feed plugin for Claude Code

This is the proposed Claude Code plugin packaging for the Scholar Feed MCP server. It ships the same stdio server that `npx scholar-feed-mcp init` installs, but distributes it through the Claude Code plugin and marketplace system so users install with two slash commands instead of editing a config file.

These files are a handoff draft. They are NOT yet wired into the repo. See NOTES.md for the exact steps to activate them and for the gap list (this repo has no skills yet).

## What the plugin is

A single plugin named `scholar-feed` that bundles the Scholar Feed MCP server. Once enabled, Claude Code starts the server automatically and the 25 Scholar Feed tools appear in Claude's toolkit:

- Core search and discovery: `search_papers`, `get_paper`, `get_citations`, `fetch_fulltext`
- Authors: `find_author`, `co_author_graph`
- Embeddings: `embed_text`
- Research: `get_field_orientation`, `get_foundational_lineage`
- Library: `save_paper`, `unsave_paper`, `like_paper`, `list_library`
- Collections: `list_collections`, `create_collection`, `add_to_collection`, `remove_from_collection`
- Watches: `create_watch`, `list_watches`, `check_watches`, `update_watch`, `preview_watch`, `delete_watch`
- Gap analysis and synthesis: `find_gaps`, `ask_library`

The server is the same one published to npm as `scholar-feed-mcp`. The plugin runs it via `npx -y scholar-feed-mcp`, so an install always pulls the published version.

## Auth and limits

No API key is required. Anonymous access gives 100 calls/day, enough for a typical research session. A free key raises that to 1,000/day per account; Pro is 10,000/day. A few tools (`embed_text`, `find_gaps`) are Pro-only, and `ask_library` is 1/month free then 200/day on Pro.

To use a key with the plugin, set `SF_API_KEY` in your environment before starting Claude Code. The bundled MCP config calls `npx`, which inherits the environment, so an exported `SF_API_KEY` is picked up by the server. Get a free key at https://www.scholarfeed.org/settings.

## How users install it

The marketplace lives in the same repo as the plugin (`YGao2005/scholar-feed-mcp`). Once the activation steps in NOTES.md are done and pushed:

```
/plugin marketplace add YGao2005/scholar-feed-mcp
/plugin install scholar-feed@scholar-feed
```

`scholar-feed@scholar-feed` reads as `<plugin-name>@<marketplace-name>`. Both are named `scholar-feed` here.

CLI equivalents (for scripting):

```
claude plugin marketplace add YGao2005/scholar-feed-mcp
claude plugin install scholar-feed@scholar-feed
```

After install, run `/reload-plugins` (or restart Claude Code) so the MCP server starts. Then try:

> Search for recent papers on test-time compute scaling

## Plugin vs. the npx init path

The existing `npx scholar-feed-mcp init` wizard still works and remains the recommended path for Cursor, Claude Desktop, and other MCP clients. The plugin is a Claude-Code-specific convenience: it adds marketplace discovery, versioning, and one-command install for Claude Code users, and it is where any bundled Scholar Feed skills would ship.

## Relationship to the published npm package

The plugin does not vendor the server code. It declares an MCP server that runs `npx -y scholar-feed-mcp`, so the npm package stays the single source of truth. Bumping the plugin `version` field controls when Claude Code offers an update to plugin users; it does not change which server version runs (npx resolves that at launch).
