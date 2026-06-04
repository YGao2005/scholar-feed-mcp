import { defineConfig } from "tsup";

/**
 * Build the published stdio bin (`build/index.js`) as a SINGLE self-contained
 * file with every runtime dependency inlined and tree-shaken.
 *
 * Why bundle instead of leaving deps external (the old `--format esm` default):
 * the stdio entry only touches the MCP SDK's stdio + server classes and zod, but
 * shipping `@modelcontextprotocol/sdk` as a runtime dep dragged in its full
 * Streamable-HTTP transport closure (express, cors, ajv, the hono tree, ...) —
 * ~24 MB of node_modules that `npx scholar-feed-mcp` had to download on the first
 * launch and again after every publish. On a slow link that cold install can
 * outrun an MCP client's start-up timeout, and the server "fails silently".
 *
 * Bundling lets esbuild keep only the code the stdio path actually reaches, so
 * the published package installs ZERO transitive deps (all five former runtime
 * deps now live in devDependencies — present for the HTTP/Worker deploy targets
 * and CI, absent for `npx`/Docker-runtime consumers, who only run this bundle).
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "build",
  clean: true,
  // Inline everything that isn't a Node built-in. `platform: "node"` keeps
  // `node:*` / bare builtins (fs, http, crypto, ...) external automatically.
  noExternal: [/.*/],
  splitting: false, // one file — the `await import("./init.js")` path is inlined
  dts: false, // a CLI bin ships no types
  minify: true, // shrink the single artifact
  treeshake: true,
  platform: "node",
  target: "node18",
  // src/index.ts already begins with `#!/usr/bin/env node`; tsup preserves it.
});
