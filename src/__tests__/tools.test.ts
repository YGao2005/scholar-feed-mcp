/**
 * Tool-registry + packaging tests.
 *
 * Unlike the old string-grep suite, the registry test actually runs
 * registerAllTools() against a fake server and asserts the exact v3 surface,
 * so it can't silently drift when tools are added/removed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAllTools } from "../tools/index.js";
import { makeFakeServer } from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "../../package.json");

/** The exact v3 tool surface. Changing the surface must update this list. */
const EXPECTED_TOOLS = [
  "search_papers",
  "get_paper",
  "get_citations",
  "fetch_fulltext",
  "find_author",
  "co_author_graph",
  "embed_text",
  "get_field_orientation",
  "get_foundational_lineage",
];

/** Active tool source files that must never use console.log (corrupts stdio). */
const ACTIVE_TOOL_FILES = [
  "search",
  "get_paper",
  "citations",
  "fulltext",
  "find_author",
  "co_author_graph",
  "embed_text",
  "get_field_orientation",
  "get_foundational_lineage",
];

describe("package.json", () => {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
    name: string;
    license: string;
    bin: Record<string, string>;
    engines: { node: string };
    files: string[];
  };

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

describe("tool registry", () => {
  it("registers exactly the 9 v3 tools", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    assert.deepStrictEqual(
      [...tools.keys()].sort(),
      [...EXPECTED_TOOLS].sort(),
    );
  });

  it("every registered tool has a non-empty description and an input schema", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    for (const [name, def] of tools) {
      assert.ok(def.description.length > 0, `${name} must have a description`);
      assert.strictEqual(
        typeof def.inputSchema,
        "object",
        `${name} must have an inputSchema`,
      );
    }
  });
});

describe("stdio hygiene", () => {
  const toolDir = resolve(__dirname, "../tools");
  // Match console.log( at line start or after whitespace — skip comment mentions.
  const callPattern = /^\s*console\.log\(/m;

  for (const mod of ACTIVE_TOOL_FILES) {
    it(`${mod}.ts uses console.error, not console.log`, () => {
      const content = readFileSync(resolve(toolDir, `${mod}.ts`), "utf-8");
      assert.ok(
        !callPattern.test(content),
        `${mod}.ts must not use console.log (corrupts JSON-RPC stdio)`,
      );
    });
  }
});
