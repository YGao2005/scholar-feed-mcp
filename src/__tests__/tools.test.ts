/**
 * Basic tests for Scholar Feed MCP server.
 *
 * These tests verify tool registration and client module structure
 * without hitting the live API (no SF_API_KEY required).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "../../package.json");

describe("package.json", () => {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  it("has correct name", () => {
    assert.strictEqual(pkg.name, "scholar-feed-mcp");
  });

  it("declares MIT license", () => {
    assert.strictEqual(pkg.license, "MIT");
  });

  it("has bin entry pointing to build/index.js", () => {
    assert.strictEqual(pkg.bin["scholar-feed-mcp"], "./build/index.js");
  });

  it("requires Node 18+", () => {
    assert.strictEqual(pkg.engines.node, ">=18.0.0");
  });

  it("only publishes build/ directory", () => {
    assert.deepStrictEqual(pkg.files, ["build"]);
  });
});

describe("tool files", () => {
  const toolDir = resolve(__dirname, "../tools");
  const barrelPath = resolve(toolDir, "index.ts");
  const barrel = readFileSync(barrelPath, "utf-8");

  // Extract tool module names from the barrel imports
  const importPattern = /from\s+"\.\/(\w+)\.js"/g;
  const toolModules: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(barrel)) !== null) {
    toolModules.push(match[1]);
  }

  it("has 23 tool modules registered", () => {
    assert.strictEqual(toolModules.length, 23);
  });

  it("each tool file exists and exports a register function", async () => {
    for (const mod of toolModules) {
      const filePath = resolve(toolDir, `${mod}.ts`);
      const content = readFileSync(filePath, "utf-8");
      assert.ok(
        content.includes("export function register"),
        `${mod}.ts must export a register function`
      );
    }
  });

  it("all tool files use console.error, not console.log", () => {
    // Match console.log( at start of line or after whitespace — skip mentions in comments
    const callPattern = /^\s*console\.log\(/m;
    for (const mod of toolModules) {
      const filePath = resolve(toolDir, `${mod}.ts`);
      const content = readFileSync(filePath, "utf-8");
      assert.ok(
        !callPattern.test(content),
        `${mod}.ts must not use console.log (corrupts JSON-RPC stdio)`
      );
    }
  });
});

describe("client module", () => {
  const clientPath = resolve(__dirname, "../client.ts");
  const content = readFileSync(clientPath, "utf-8");

  it("reads API key from SF_API_KEY env var", () => {
    assert.ok(content.includes('process.env.SF_API_KEY'));
  });

  it("supports SF_API_BASE_URL override", () => {
    assert.ok(content.includes('process.env.SF_API_BASE_URL'));
  });

  it("uses Bearer auth header when key is present", () => {
    assert.ok(content.includes('Bearer'));
  });

  it("makes API key optional", () => {
    assert.ok(content.includes('?? null'), "API key should default to null when not set");
    assert.ok(!content.includes('process.exit(1)'), "Should not exit when API key is missing");
  });

  it("does not use console.log in code", () => {
    // Match console.log( at start of line or after whitespace — skip mentions in comments
    const callPattern = /^\s*console\.log\(/m;
    assert.ok(!callPattern.test(content));
  });
});
