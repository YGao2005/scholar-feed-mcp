/**
 * `init` wizard — OpenAI Codex config writing.
 *
 * Codex is the one auto-configured client that uses TOML, and it REJECTS a
 * duplicate `[mcp_servers.<name>]` table with a parse error that takes down every
 * other server in the file. So the two properties that matter are:
 *   1. appending produces valid TOML for any well-formed input (including a file
 *      with no trailing newline), and
 *   2. it is idempotent — a second run must not add a second table.
 *
 * These run against a real temp file rather than a mocked fs: the bug class here
 * is corrupting a user's editor config on disk, which a mock cannot catch.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { appendCodexConfig, codexConfigPath } from "../init.js";

/** Count `[mcp_servers.scholar-feed]` table headers in a TOML string. */
function countTables(toml: string): number {
  return (
    toml.match(/^\s*\[\s*mcp_servers\s*\.\s*"?scholar-feed"?\s*\]/gm) ?? []
  ).length;
}

describe("init: Codex config.toml", () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sf-codex-"));
    configPath = join(dir, ".codex", "config.toml");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the file (and parent dir) when absent, with the key", () => {
    const outcome = appendCodexConfig(configPath, "sf_testkey123");
    assert.strictEqual(outcome, "written");

    const toml = readFileSync(configPath, "utf-8");
    assert.match(toml, /^\[mcp_servers\.scholar-feed\]$/m);
    assert.match(toml, /^command = "npx"$/m);
    assert.match(toml, /^args = \["-y", "scholar-feed-mcp@latest"\]$/m);
    assert.match(toml, /^env = \{ SF_API_KEY = "sf_testkey123" \}$/m);
    assert.ok(toml.endsWith("\n"), "must end with a newline");
  });

  it("omits the env line entirely when no key is given", () => {
    appendCodexConfig(configPath, "");
    const toml = readFileSync(configPath, "utf-8");
    assert.match(toml, /^\[mcp_servers\.scholar-feed\]$/m);
    assert.ok(!toml.includes("env"), "keyless config must have no env line");
  });

  it("preserves an existing config and its other servers", () => {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      `model = "gpt-5-codex"

[mcp_servers.other-server]
command = "uvx"
args = ["some-other-mcp"]
`,
    );

    const outcome = appendCodexConfig(configPath, "sf_abc");
    assert.strictEqual(outcome, "written");

    const toml = readFileSync(configPath, "utf-8");
    assert.match(toml, /^model = "gpt-5-codex"$/m, "top-level key preserved");
    assert.match(
      toml,
      /^\[mcp_servers\.other-server\]$/m,
      "other server preserved",
    );
    assert.match(toml, /^\[mcp_servers\.scholar-feed\]$/m);
    // The new table header must start its own line, or it would be parsed as
    // part of the previous table's value.
    assert.ok(
      /\n\[mcp_servers\.scholar-feed\]/.test(toml),
      "new table must begin on its own line",
    );
  });

  it("inserts a newline when the existing file does not end with one", () => {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, 'model = "gpt-5-codex"'); // deliberately no \n

    appendCodexConfig(configPath, "");

    const toml = readFileSync(configPath, "utf-8");
    // The failure this guards: `...gpt-5-codex"[mcp_servers.scholar-feed]` on one
    // line, which is a TOML parse error.
    assert.ok(
      !/gpt-5-codex"\[/.test(toml),
      `table header spliced onto the value line: ${JSON.stringify(toml)}`,
    );
    assert.match(toml, /^model = "gpt-5-codex"$/m);
    assert.match(toml, /^\[mcp_servers\.scholar-feed\]$/m);
  });

  it("is idempotent — a second run does not add a duplicate table", () => {
    assert.strictEqual(appendCodexConfig(configPath, "sf_one"), "written");
    assert.strictEqual(
      appendCodexConfig(configPath, "sf_two"),
      "already-present",
    );

    const toml = readFileSync(configPath, "utf-8");
    assert.strictEqual(countTables(toml), 1, "exactly one table");
    // The first key must survive untouched — we must not silently rewrite it.
    assert.match(toml, /sf_one/);
    assert.ok(!toml.includes("sf_two"), "second run must not write a new key");
  });

  it("detects the quoted table form so it stays idempotent", () => {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      '[mcp_servers."scholar-feed"]\ncommand = "npx"\n',
    );
    assert.strictEqual(
      appendCodexConfig(configPath, "sf_x"),
      "already-present",
    );
    assert.strictEqual(countTables(readFileSync(configPath, "utf-8")), 1);
  });

  // Every one of these already defines mcp_servers.scholar-feed. Appending a
  // header for it is a TOML duplicate-key error, which makes Codex refuse to parse
  // the file at all — taking down the user's OTHER servers with it. Detecting only
  // the plain table header was not enough.
  for (const [label, body] of [
    ["dotted key", 'mcp_servers.scholar-feed.command = "old"\n'],
    [
      "fully quoted header",
      '["mcp_servers"."scholar-feed"]\ncommand = "old"\n',
    ],
    [
      "inline table at the root",
      'mcp_servers = { scholar-feed = { command = "old" } }\n',
    ],
  ] as const) {
    it(`refuses to append when the config uses the ${label} form`, () => {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, body);
      const outcome = appendCodexConfig(configPath, "sf_new");

      assert.ok(
        outcome === "already-present" || outcome === "manual",
        `must not write; got ${outcome}`,
      );
      // The decisive assertion: the file is untouched, so it cannot have become
      // a duplicate definition.
      assert.strictEqual(readFileSync(configPath, "utf-8"), body);
    });
  }

  // A key that is not TOML-safe must never reach the file. Prefix-only validation
  // let `sf_bad"key` through and broke the whole config.
  for (const badKey of ['sf_bad"key', "sf_back\\slash", "sf_new\nline"]) {
    it(`declines to write an unsafe key (${JSON.stringify(badKey)})`, () => {
      assert.strictEqual(appendCodexConfig(configPath, badKey), "manual");
      assert.throws(
        () => readFileSync(configPath, "utf-8"),
        "must not have created the file at all",
      );
    });
  }

  it("creates the file 0600 — it can hold an API key", () => {
    appendCodexConfig(configPath, "sf_secret");
    const mode = statSync(configPath).mode & 0o777;
    assert.strictEqual(
      mode,
      0o600,
      `expected 0600, got 0${mode.toString(8)} (0644 would be world-readable)`,
    );
  });

  it("preserves the mode of a file the user already had", () => {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, 'model = "gpt-5-codex"\n', { mode: 0o640 });
    appendCodexConfig(configPath, "sf_secret");
    assert.strictEqual(statSync(configPath).mode & 0o777, 0o640);
  });

  it("leaves no temp file behind", () => {
    appendCodexConfig(configPath, "sf_abc");
    const leftovers = readdirSync(dirname(configPath)).filter((f) =>
      f.includes(".tmp"),
    );
    assert.deepStrictEqual(leftovers, []);
  });
});

describe("init: codexConfigPath", () => {
  const saved = process.env.CODEX_HOME;
  afterEach(() => {
    if (saved === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = saved;
  });

  it("honours CODEX_HOME, which Codex itself reads", () => {
    process.env.CODEX_HOME = join("/tmp", "custom-codex");
    assert.strictEqual(
      codexConfigPath(),
      join("/tmp", "custom-codex", "config.toml"),
    );
  });

  it("falls back to ~/.codex/config.toml", () => {
    delete process.env.CODEX_HOME;
    assert.strictEqual(
      codexConfigPath(),
      join(homedir(), ".codex", "config.toml"),
    );
  });
});
