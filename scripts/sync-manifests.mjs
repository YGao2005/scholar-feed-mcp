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
import { readFileSync, writeFileSync } from "node:fs";

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
  // Read first and handle ENOENT, rather than existsSync-then-read: the check
  // and the use are separate syscalls, so the file can change in between
  // (CodeQL js/file-system-race). Attempting the read is both race-free and
  // one syscall cheaper.
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`  skip   ${file} (absent)`);
      continue;
    }
    throw err;
  }
  const before = JSON.parse(raw).version;

  // Rewrite the version STRINGS in place rather than re-serialising the parsed
  // document. `JSON.stringify(doc, null, 2)` does not reproduce Prettier's JSON
  // output, so re-serialising made every sync fail `npm run format:check` — and
  // because the sync runs from the `npm version` lifecycle hook, that would put
  // a lint failure inside the release commit the tag points at.
  //
  // The pattern matches the literal key `"version"`, which is why it updates
  // server.json's top-level version AND its packages[].version (the registry
  // validates that against npm, so both must match) while never touching
  // manifest.json's `"manifest_version"` — that key has no `"version"`
  // substring, since the opening quote belongs to `"manifest_version"`.
  const next = raw.replace(/("version"\s*:\s*")[^"]*(")/g, `$1${version}$2`);
  if (next !== raw) {
    writeFileSync(file, next);
    changed++;
    console.log(`  sync   ${file}  ${before} -> ${version}`);
  } else {
    console.log(`  ok     ${file}  ${version}`);
  }
}

console.log(`\nsync-manifests: ${changed} file(s) updated to ${version}`);
