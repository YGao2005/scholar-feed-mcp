#!/usr/bin/env node
/**
 * Stamp package.json's version onto every distribution manifest.
 *
 * WHY THIS EXISTS: on 2026-09-06 an audit of the live listings found four
 * manifests carrying four different versions — package.json 3.19.1,
 * server.json 3.9.1, manifest.json 3.8.0, .claude-plugin 3.7.1. Only
 * server.json was ever synced (in publish.yml, at publish time), so the other
 * three had silently drifted eleven releases behind and were shipping that
 * stale version to the MCPB bundle and the plugin directories.
 *
 * Wired as the npm `version` lifecycle script, so `npm version <patch|minor|major>`
 * syncs and stages them as part of the release commit the tag points at.
 * `distribution_manifests.test.ts` is the backstop: it fails the tagged
 * `verify` job if any manifest is out of step, so a forgotten sync cannot
 * reach npm.
 *
 * server.json is included here even though publish.yml also syncs it — belt
 * and braces, and it keeps the committed file honest between releases.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;

/** JSON manifests whose top-level `version` tracks package.json. */
const JSON_TARGETS = [
  "server.json",
  "manifest.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
];

let changed = 0;
for (const file of JSON_TARGETS) {
  if (!existsSync(file)) {
    console.warn(`  skip   ${file} (absent)`);
    continue;
  }
  const raw = readFileSync(file, "utf8");
  const doc = JSON.parse(raw);
  const before = doc.version;
  doc.version = version;

  // server.json additionally pins each package reference to the same version;
  // the registry validates that against npm, so it must match exactly.
  if (Array.isArray(doc.packages)) {
    for (const p of doc.packages) p.version = version;
  }

  // Preserve the 2-space + trailing-newline shape the repo already uses, so a
  // sync never shows up as unrelated formatting churn in a release diff.
  const next = `${JSON.stringify(doc, null, 2)}\n`;
  if (next !== raw) {
    writeFileSync(file, next);
    changed++;
    console.log(`  sync   ${file}  ${before} -> ${version}`);
  } else {
    console.log(`  ok     ${file}  ${version}`);
  }
}

console.log(`\nsync-manifests: ${changed} file(s) updated to ${version}`);
