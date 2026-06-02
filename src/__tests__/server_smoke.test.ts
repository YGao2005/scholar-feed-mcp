/**
 * Server spawn-smoke tests — the only tests that run the REAL entry point as a
 * child process, so they catch what the in-process handler tests can't:
 *   - bootstrap stdout purity: --version writes ONLY the version to stdout, and
 *     nothing else pollutes the JSON-RPC channel (the BUG-1 class — a stray
 *     console.log in index.ts's server path);
 *   - the SF_API_KEY is never echoed to stdout OR stderr at runtime;
 *   - every byte the server writes to stdout during a session is framed JSON-RPC.
 *
 * Spawns the TS source via `node --import tsx` (no build step needed). These are
 * behavioural, not coverage — the child runs uninstrumented.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(__dirname, "../index.ts");
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf-8"),
) as { version: string };

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runEntry(
  args: string[],
  opts: {
    env?: Record<string, string>;
    stdin?: string;
    killAfterMs?: number;
  } = {},
): Promise<RunResult> {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, ["--import", "tsx", ENTRY, ...args], {
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.stdin.on("error", () => {}); // swallow EPIPE if the child already exited

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (opts.killAfterMs !== undefined) {
      timer = setTimeout(() => child.kill("SIGKILL"), opts.killAfterMs);
    }
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolveP({ stdout, stderr, code });
    });

    if (opts.stdin !== undefined) child.stdin.write(opts.stdin);
    if (opts.killAfterMs === undefined) child.stdin.end();
  });
}

describe("server spawn-smoke", () => {
  it("--version writes only the version line to stdout (clean, exit 0)", async () => {
    const { stdout, code } = await runEntry(["--version"]);
    assert.strictEqual(code, 0);
    // Exactly the version line — nothing else leaked onto the JSON-RPC channel.
    assert.strictEqual(stdout, `scholar-feed-mcp v${pkg.version}\n`);
    // (stderr intentionally not asserted: node/tsx may emit loader warnings there.)
  });

  it("server runtime keeps stdout JSON-RPC-only and never echoes SF_API_KEY", async () => {
    const SECRET = "sf_smoke_must_not_leak_0xCAFE";
    const initialize =
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "smoke", version: "0" },
        },
      }) + "\n";

    const { stdout, stderr } = await runEntry([], {
      env: { SF_API_KEY: SECRET },
      stdin: initialize,
      killAfterMs: 2500,
    });

    // The key must never appear on either stream (startup banner, logs, responses).
    assert.ok(!stdout.includes(SECRET), "SF_API_KEY must not appear on stdout");
    assert.ok(!stderr.includes(SECRET), "SF_API_KEY must not appear on stderr");

    // Every non-empty stdout line must be a framed JSON-RPC message — no stray
    // logs/prints. (Vacuously true if the server emitted nothing in the window;
    // the point is that whatever it DID emit is well-formed JSON-RPC.)
    for (const line of stdout.split("\n").filter((l) => l.trim() !== "")) {
      let parsed: unknown;
      assert.doesNotThrow(
        () => (parsed = JSON.parse(line)),
        `non-JSON-RPC line leaked onto stdout: ${line}`,
      );
      assert.strictEqual(
        (parsed as { jsonrpc?: string }).jsonrpc,
        "2.0",
        "stdout lines must be JSON-RPC 2.0 frames",
      );
    }
  });
});
