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
  // v3.3 write/library surface (require SF_API_KEY)
  "save_paper",
  "unsave_paper",
  "like_paper",
  "list_library",
  "list_collections",
  "create_collection",
  "add_to_collection",
  "remove_from_collection",
  // v3.4 watch surface (require SF_API_KEY)
  "create_watch",
  "list_watches",
  "check_watches",
  "delete_watch",
  // v3.7 watch v2: structured filters + tuning loop (require SF_API_KEY)
  "update_watch",
  "preview_watch",
  // v3.5 gap analysis (read-only, Pro, requires SF_API_KEY)
  "find_gaps",
  // v3.6 ask-my-library (read-only; free 1/mo, Pro 200/day; requires SF_API_KEY)
  "ask_library",
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
  "library",
  "collections_write",
  "watches",
  "gaps",
  "ask_library",
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
  it("registers exactly the 25 tools", () => {
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

describe("watch tools surface", () => {
  const watchTools = [
    "create_watch",
    "list_watches",
    "check_watches",
    "delete_watch",
    "update_watch",
    "preview_watch",
  ];

  it("registers all watch tools", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    for (const name of watchTools) {
      assert.ok(tools.has(name), `${name} must be registered`);
    }
  });

  it("each watch tool requires an SF_API_KEY in its description", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    for (const name of watchTools) {
      assert.match(
        tools.get(name)!.description,
        /SF_API_KEY/,
        `${name} description must mention SF_API_KEY`,
      );
    }
  });

  it("mutating watch tools advertise MUTATES; read tools do not", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    assert.match(tools.get("create_watch")!.description, /MUTATES/);
    assert.match(tools.get("delete_watch")!.description, /MUTATES/);
    assert.match(tools.get("update_watch")!.description, /MUTATES/);
    assert.doesNotMatch(tools.get("list_watches")!.description, /MUTATES/);
    assert.doesNotMatch(tools.get("check_watches")!.description, /MUTATES/);
    assert.doesNotMatch(tools.get("preview_watch")!.description, /MUTATES/);
  });

  it("idempotent watch tools say so in their descriptions", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    assert.match(tools.get("create_watch")!.description, /get-or-create/i);
    assert.match(tools.get("check_watches")!.description, /idempotent/i);
    assert.match(tools.get("delete_watch")!.description, /idempotent/i);
  });

  it("create_watch exposes name, novelty_min, and every seed selector", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    const schema = tools.get("create_watch")!.inputSchema;
    for (const key of [
      "name",
      "novelty_min",
      "q",
      "collection_name",
      "collection_id",
      "anchor_paper_id",
      "scope_to_citations_of",
      "author_id",
      "category",
    ]) {
      assert.ok(key in schema, `create_watch inputSchema must include ${key}`);
    }
  });

  it("check_watches exposes watch_name, watch_id, and limit", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    const schema = tools.get("check_watches")!.inputSchema;
    for (const key of ["watch_name", "watch_id", "limit"]) {
      assert.ok(key in schema, `check_watches inputSchema must include ${key}`);
    }
  });

  it("delete_watch exposes name and watch_id", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    const schema = tools.get("delete_watch")!.inputSchema;
    for (const key of ["name", "watch_id"]) {
      assert.ok(key in schema, `delete_watch inputSchema must include ${key}`);
    }
  });

  it("list_watches takes no input parameters", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    assert.deepStrictEqual(
      Object.keys(tools.get("list_watches")!.inputSchema),
      [],
    );
  });
});

describe("gap-analysis tool surface", () => {
  it("registers find_gaps", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    assert.ok(tools.has("find_gaps"), "find_gaps must be registered");
  });

  it("find_gaps requires an SF_API_KEY and is read-only (no MUTATES)", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    const desc = tools.get("find_gaps")!.description;
    assert.match(desc, /SF_API_KEY/);
    assert.doesNotMatch(desc, /MUTATES/);
  });

  it("find_gaps exposes both seeds, scope, and limit", () => {
    const { server, tools } = makeFakeServer();
    registerAllTools(server);
    const schema = tools.get("find_gaps")!.inputSchema;
    for (const key of [
      "collection_name",
      "collection_id",
      "topic",
      "scope",
      "limit",
    ]) {
      assert.ok(key in schema, `find_gaps inputSchema must include ${key}`);
    }
  });
});

describe("stdio hygiene", () => {
  const toolDir = resolve(__dirname, "../tools");
  const srcDir = resolve(__dirname, "..");
  // Match console.log( at line start or after whitespace — skip comment mentions.
  const callPattern = /^\s*console\.log\(/m;

  for (const mod of ACTIVE_TOOL_FILES) {
    it(`tools/${mod}.ts uses console.error, not console.log`, () => {
      const content = readFileSync(resolve(toolDir, `${mod}.ts`), "utf-8");
      assert.ok(
        !callPattern.test(content),
        `${mod}.ts must not use console.log (corrupts JSON-RPC stdio)`,
      );
    });
  }

  // The entry point + HTTP client also run while stdout IS the JSON-RPC channel.
  // The old guard scanned only tools/ — a stray console.log moved into index.ts's
  // main() would have shipped silently. --version intentionally uses
  // process.stdout.write (a pre-server CLI path that exits), NOT console.log, so
  // this ban holds. init.ts is exempt: the interactive wizard exits before the
  // server starts and legitimately prints prompts to stdout.
  for (const f of ["index.ts", "client.ts"]) {
    it(`${f} uses console.error, not console.log`, () => {
      const content = readFileSync(resolve(srcDir, f), "utf-8");
      assert.ok(
        !callPattern.test(content),
        `${f} must not use console.log (corrupts JSON-RPC stdio)`,
      );
    });
  }
});
