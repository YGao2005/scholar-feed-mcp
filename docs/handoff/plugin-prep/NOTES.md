# Activation notes and gap list

This directory holds DRAFT plugin files. They are not loaded by Claude Code yet. To activate them, you move them into the layout Claude Code expects, then commit and push. Everything below is verified against the official docs (code.claude.com/docs/en/plugins, /plugin-marketplaces, /plugins-reference) as of 2026-06.

## File layout Claude Code requires

For a marketplace and a plugin hosted in the SAME repo (the simplest setup here), you need two manifests:

```
scholar-feed-mcp/                         (repo root = marketplace root)
  .claude-plugin/
    marketplace.json                      <- the marketplace catalog
    plugin.json                           <- the plugin manifest
  skills/                                 <- (optional) bundled skills, see GAP list
    <skill-name>/SKILL.md
```

Important rule from the docs: ONLY `plugin.json` goes inside `.claude-plugin/`. Component
directories (`skills/`, `commands/`, `agents/`, `hooks/`) and `.mcp.json` must live at the
plugin ROOT, not inside `.claude-plugin/`.

Because the plugin and the marketplace share the repo root, the marketplace entry uses
`"source": "./"` (the plugin root is the repo root). Relative-path sources resolve against the
marketplace root and only work when users add the marketplace via git (which they will:
`/plugin marketplace add YGao2005/scholar-feed-mcp`).

## Exact steps to activate

1. Create the manifest directory at the repo root:
   `mkdir -p .claude-plugin`

2. Move the two draft manifests into it:
   - `docs/handoff/plugin-prep/plugin.json`      -> `.claude-plugin/plugin.json`
   - `docs/handoff/plugin-prep/marketplace.json` -> `.claude-plugin/marketplace.json`

   The `README.md` and this `NOTES.md` stay here as handoff docs; they are not part of the
   loaded plugin. (You may instead use the repo's existing top-level README.md as the plugin's
   shareable README; the docs only require "a README.md" for distribution, not a specific one.)

3. Decide on the MCP declaration. Two equivalent options; pick ONE:
   - Inline (what the draft `plugin.json` does): the `mcpServers` object is embedded in the
     manifest. Nothing else to add.
   - External file: drop the `mcpServers` block from `plugin.json` and instead add a `.mcp.json`
     at the repo root containing the SAME standard MCP config. The repo already has a `.mcp.json`
     (`{ "mcpServers": { "scholar-feed": { "command": "npx", "args": ["-y","scholar-feed-mcp"] } } }`),
     which the plugin loader reads automatically from the plugin root. If you keep that file AND
     leave `mcpServers` inline in the manifest, both are merged. To avoid confusion, keep exactly
     one source of truth. Recommended: inline in `plugin.json`, and confirm the existing root
     `.mcp.json` does not double-register the server.

4. Validate before pushing:
   `claude plugin validate .`            (checks marketplace.json + referenced plugin.json)
   `claude plugin validate ./`           (against the plugin dir, checks plugin.json + any skills)
   Optionally `claude plugin validate . --strict` to treat warnings as errors in CI.

5. Test locally without publishing:
   `claude --plugin-dir .`               (loads the plugin from the working tree for one session)
   Then confirm the 25 tools appear and a `search_papers` call works.

6. Commit and push to `main` (or a release branch). Users can then run:
   `/plugin marketplace add YGao2005/scholar-feed-mcp`
   `/plugin install scholar-feed@scholar-feed`
   followed by `/reload-plugins`.

## Versioning behavior to know

- `version` in `plugin.json` PINS the plugin. Existing users only get an update when you bump it.
  The draft sets `"version": "3.7.1"` to track the npm package version. Bump it on every release,
  or remove it to let the git commit SHA drive updates (every commit = new version).
- The `version` also appears in the marketplace entry as `3.7.1`. The docs warn: do NOT rely on
  both at once, because the `plugin.json` value always wins silently. Keep them in sync, or set
  `version` in only one place. Simplest: keep it in `plugin.json` only and drop it from the
  marketplace entry.
- The plugin `version` does NOT control which server version runs. `npx -y scholar-feed-mcp`
  resolves the latest published npm version at launch. The two are independent.

## Schema fields: confident vs. uncertain

Confident (verified in the official schema tables):
- plugin.json: `name` (only required field), `displayName`, `version`, `description`, `author`
  (object with `name`/`email`/`url`), `homepage`, `repository` (string URL), `license`,
  `keywords` (array), `mcpServers` (string path | array | inline object).
- marketplace.json: `name` (required), `owner` (object, `name` required, `email` optional),
  `plugins` (array). Each plugin entry: `name` + `source` required; may also carry any
  plugin-manifest field plus `category`, `tags`, `strict`, `displayName`, `defaultEnabled`.
- `source: "./"` (relative path) is valid and resolves to the marketplace root.
- MCP config uses standard keys: `command`, `args`, `env`, `cwd`. `${CLAUDE_PLUGIN_ROOT}` is only
  needed when referencing files bundled inside the plugin. Our server runs from npm via npx, so
  no path variable is required.

Uncertain / left out on purpose:
- Whether the marketplace `name` "scholar-feed" collides with anything. It is NOT on the reserved
  list (claude-plugins-official, anthropic-*, etc.), so it should be fine, but each user can
  register only one marketplace per name, so the name is effectively a public identifier. If you
  later want a clearer split, rename the marketplace (e.g. "scholar-feed-tools") and keep the
  plugin name "scholar-feed".
- `category` value: the docs describe `category` as free-form ("for organization") with no
  enumerated list, so "research" is a guess at a sensible label, not a validated enum.
- Community-marketplace submission (the `anthropics/claude-plugins-community` catalog) is a
  separate, reviewed process via claude.ai/settings/plugins/submit. Not required for self-hosting;
  noted only if you later want public discovery.

## GAP LIST: skills are referenced but not present in this repo

This repo currently has NO `skills/` directory and NO `commands/` directory. The plugin as drafted
ships the MCP server ONLY. That is a complete, working plugin on its own. But the product already
references skills that are NOT in this repo, and a plugin is the natural place to bundle them. To
ship any of them, the OWNER must supply the source files. Specifics:

1. `/field-guide`
   - Referenced in README.md (the v1 `field_guide` tool was "demoted to a skill") and in
     src/tools/index.ts ("Demoted to skills: compare_methods, field_guide").
   - Source files: NOT in this repo. The README points to https://www.scholarfeed.org/skills as
     the canonical location.
   - To bundle: create `skills/field-guide/SKILL.md` at the plugin root, with YAML frontmatter
     (`description:` so Claude knows when to invoke it) and the skill body. Supporting files
     (reference.md, scripts/) may sit alongside it in `skills/field-guide/`.
   - Installed name will be namespaced: `/scholar-feed:field-guide`.

2. `/compare-methods`
   - Referenced in README.md migration table ("compare_methods -> use the /compare-methods skill,
     see scholarfeed.org/skills") and in src/tools/index.ts.
   - Source files: NOT in this repo. Same canonical location (scholarfeed.org/skills).
   - To bundle: `skills/compare-methods/SKILL.md` at the plugin root, same shape as above.
   - Installed name: `/scholar-feed:compare-methods`.

3. The "scholar-feed" skill at scholarfeed.org/skills
   - The product hosts a Scholar Feed skill (the same description that exists in the user's local
     skill set: "Search, explore, and read CS/AI/ML research papers via the Scholar Feed MCP
     server"). It is NOT in this repo.
   - To bundle: `skills/scholar-feed/SKILL.md` at the plugin root. Note: namespacing would make it
     `/scholar-feed:scholar-feed`, which is awkward. Consider a clearer folder name such as
     `skills/literature-review/SKILL.md` -> `/scholar-feed:literature-review`, or `skills/research/`.

What the owner must do for skills, concretely:
- Obtain the canonical SKILL.md source for each skill from scholarfeed.org/skills (or wherever the
  authoritative copy lives; it is not in version control here).
- Place each under `skills/<name>/SKILL.md` at the plugin ROOT (NOT inside `.claude-plugin/`, and
  NOT inside docs/).
- Ensure each SKILL.md has a `description:` frontmatter field; that string is what triggers
  model invocation.
- Re-run `claude plugin validate ./` to confirm the frontmatter parses, then `/reload-plugins`.
- No change to plugin.json is needed to pick up `skills/` at the default location. Only add a
  `skills` path field to the manifest if you store them somewhere non-default.

Until those source files are supplied, ship the MCP-only plugin (the draft as-is). It is valid and
useful on its own; skills can be added in a later version bump.
