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
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { appendCodexConfig } from "../init.js";

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
});
