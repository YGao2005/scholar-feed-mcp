#!/usr/bin/env node
/**
 * Reproducibly pack the MCPB bundle (Claude Desktop one-click install).
 *
 * build/index.js is NOT self-contained — tsup leaves @modelcontextprotocol/sdk
 * and zod (and their prod closure) as external runtime imports, so the .mcpb must
 * ship a node_modules. But the repo's node_modules is the full ~300MB dev tree
 * (wrangler/workerd/typescript/esbuild/...), and `mcpb pack .` would bundle all of
 * it plus coverage/, dist-worker/, docs/, src/. Instead we stage a minimal tree
 * with a PRODUCTION-ONLY install and pack that — a lean (~3MB) bundle, without
 * touching the repo's node_modules.
 *
 * Usage: npm run mcpb:pack   ->  ./scholar-feed-mcp.mcpb (gitignored)
 */
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const out = join(repo, "scholar-feed-mcp.mcpb");
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
const exists = async (p) =>
  access(p)
    .then(() => true)
    .catch(() => false);

console.error("[mcpb] building the stdio bundle (npm run build)...");
run("npm", ["run", "build"], repo);

const stage = await mkdtemp(join(tmpdir(), "sf-mcpb-"));
try {
  console.error(`[mcpb] staging a production-only tree at ${stage}`);
  // Only what the bundle needs: the manifest, the stdio build, the branded icon,
  // and the package files so a prod install resolves the runtime deps.
  const items = [
    "manifest.json",
    "package.json",
    "package-lock.json",
    "build",
    "assets/icon-marketplace.png",
    "README.md",
    "LICENSE",
  ];
  for (const item of items) {
    const src = join(repo, item);
    if (!(await exists(src))) continue;
    const dest = join(stage, item);
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
  }

  console.error(
    "[mcpb] installing PRODUCTION dependencies in the staging tree...",
  );
  run("npm", ["ci", "--omit=dev", "--ignore-scripts"], stage);

  console.error("[mcpb] packing...");
  run("npx", ["--yes", "@anthropic-ai/mcpb", "pack", stage, out], repo);
  console.error(`[mcpb] done -> ${out}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
