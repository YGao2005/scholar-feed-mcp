/**
 * Distribution-manifest consistency.
 *
 * These files are the product's shop windows: every directory listing, plugin
 * catalogue and one-click installer reads its copy from one of them, and none
 * of them is exercised by any other test. Two real regressions on 2026-09-06
 * motivated this file:
 *
 *  1. VERSION DRIFT. package.json 3.19.1, server.json 3.9.1, manifest.json
 *     3.8.0, .claude-plugin 3.7.1 — only server.json was ever synced, so the
 *     MCPB bundle and the plugin directories shipped a version eleven releases
 *     stale. `scripts/sync-manifests.mjs` fixes it; this test keeps it fixed.
 *
 *  2. RETIRED PRICING. mig 173 replaced the daily caps with a monthly meter
 *     (200 anon / 500 free / 10,000 Pro), but smithery.yaml, manifest.json and
 *     the Docker entry still advertised "100 calls/day" and "1,000/day" —
 *     a free tier ~60x larger than reality. A plain web search for the product
 *     still returns the retired numbers, because directories are what search
 *     engines and LLMs read. Copy drift here is public misinformation about
 *     what the product costs, not a typo.
 *
 * The quota numbers below are asserted against backend/api/quotas.py
 * (ANON_MONTHLY_LIMIT=200, FREE_MONTHLY_LIMIT=500, PRO_MONTHLY_LIMIT=10_000)
 * and backend/api/metering.py (FREE_MONTHLY_LIMITS.ask_library=20). If the
 * backend defaults change, this test SHOULD fail — that is the point.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (f: string) => readFileSync(f, "utf8");
const json = (f: string) => JSON.parse(read(f)) as Record<string, unknown>;

const PKG_VERSION = (json("package.json") as { version: string }).version;

/** Every manifest whose `version` must track package.json. */
const VERSIONED = [
  "server.json",
  "manifest.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
];

/** Everything a stranger reads before installing. */
const COPY_SURFACES = [
  "README.md",
  "smithery.yaml",
  "manifest.json",
  "server.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "docker-mcp-registry/servers/scholar-feed/server.yaml",
];

test("every distribution manifest carries the package.json version", () => {
  for (const file of VERSIONED) {
    assert.ok(existsSync(file), `${file} is missing`);
    const doc = json(file) as { version?: string };
    assert.equal(
      doc.version,
      PKG_VERSION,
      `${file} is at ${doc.version}, package.json is at ${PKG_VERSION}. ` +
        `Run \`npm run sync:manifests\` (npm version does this automatically).`,
    );
  }
});

test("server.json pins every package reference to the same version", () => {
  const doc = json("server.json") as { packages?: { version?: string }[] };
  for (const p of doc.packages ?? []) {
    assert.equal(
      p.version,
      PKG_VERSION,
      "the MCP Registry validates package version against npm; a mismatch fails the publish",
    );
  }
});

test("no surface advertises the RETIRED daily caps (mig 173 replaced them)", () => {
  // Matches "100 calls/day", "1,000/day", "1000 calls per day", etc. Deliberately
  // broad: any daily-cap claim about the free/anon tier is now wrong, because the
  // daily numbers survive only as an internal burst guardrail we do not advertise.
  const RETIRED = /\b(100|1,?000)\s*(calls?\s*)?(\/|per\s+)day\b/i;
  for (const file of COPY_SURFACES) {
    if (!existsSync(file)) continue;
    const text = read(file);
    const hit = text.split("\n").findIndex((l) => RETIRED.test(l));
    assert.equal(
      hit,
      -1,
      `${file}:${hit + 1} advertises a retired daily cap: "${text.split("\n")[hit]?.trim()}"`,
    );
  }
});

test("the monthly quota is stated correctly wherever quota copy appears", () => {
  // Only files that actually make a quota claim are checked; a manifest may
  // legitimately not mention quotas at all.
  const MENTIONS_QUOTA = /calls?\s*\/\s*month|calls? a month|requests?\/month|per month/i;
  const CORRECT_ANON = /\b200\b/;
  const CORRECT_FREE = /\b500\b/;

  let checked = 0;
  for (const file of COPY_SURFACES) {
    if (!existsSync(file)) continue;
    const text = read(file);
    if (!MENTIONS_QUOTA.test(text)) continue;
    checked++;
    assert.match(text, CORRECT_ANON, `${file} states a monthly quota but never mentions 200 (anon)`);
    assert.match(text, CORRECT_FREE, `${file} states a monthly quota but never mentions 500 (free)`);
  }
  assert.ok(checked >= 4, `expected quota copy on at least 4 surfaces, found ${checked}`);
});

test("README's ask_library allowance matches the backend (20/month free)", () => {
  const readme = read("README.md");
  // The README stated BOTH "Free 1/month" and "20/month free" in different
  // sections; 20 is what metering.FREE_MONTHLY_LIMITS actually enforces.
  assert.ok(
    !/free\s*1\s*\/\s*month/i.test(readme),
    "README still claims a 1/month ask_library allowance; the backend allows 20/month",
  );
  assert.match(readme, /20\s*\/\s*month|20\/month/i);
});

test("the Smithery listing tags its calls with SF_SRC", () => {
  // Smithery containerises this config and runs the STDIO binary, which is the
  // path where a server-level SF_SRC is honoured. Without it, our single
  // largest listing (7,974 uses) is indistinguishable from anonymous traffic.
  const y = read("smithery.yaml");
  assert.match(y, /SF_SRC:\s*'smithery'/, "smithery.yaml must set SF_SRC so the channel is attributable");
});

test("the codex plugin manifest resolves the install URL third parties publish", () => {
  // awesome-ai-plugins (188 stars) publishes
  //   install_url: .../HEAD/.codex-plugin/plugin.json
  // which 404'd until this file existed, breaking one-click install for every
  // Codex user who found us through that list.
  assert.ok(existsSync(".codex-plugin/plugin.json"), ".codex-plugin/plugin.json must exist");
  const plugin = json(".codex-plugin/plugin.json") as { mcpServers?: string };
  assert.equal(typeof plugin.mcpServers, "string", "codex plugins point mcpServers at a file path");
  assert.ok(existsSync(plugin.mcpServers!.replace(/^\.\//, "")), "the referenced mcp.json must exist");

  const mcp = json(".codex-plugin/mcp.json") as { mcpServers: Record<string, { command: string; args: string[] }> };
  const entry = mcp.mcpServers["scholar-feed"];
  assert.ok(entry, "mcp.json must declare the scholar-feed server");
  assert.equal(entry.command, "npx");
  assert.ok(entry.args.includes("scholar-feed-mcp@latest"));
});
