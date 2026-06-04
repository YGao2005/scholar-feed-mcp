/**
 * Tool-annotation + name-audit tests (M2).
 *
 * Directory submission (Anthropic Connectors / OpenAI) REQUIRES every tool to
 * carry a human-readable `title` plus `readOnlyHint`/`destructiveHint`
 * annotations. These tests register the real tools on the fake server and assert
 * that all 25 are present, each has a non-empty title, the hints match the
 * locked M2 table (spec §6 / DECISIONS), and every tool name is within the MCP
 * 64-char name budget.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerAllTools } from "../tools/index.js";
import { makeFakeServer, type CapturedTool } from "./helpers.js";

/** The locked M2 hint table — the single source of truth for this milestone. */
const READ_ONLY_TOOLS = [
  "search_papers",
  "get_paper",
  "get_citations",
  "fetch_fulltext",
  "find_author",
  "co_author_graph",
  "embed_text",
  "get_field_orientation",
  "get_foundational_lineage",
  "find_gaps",
  "ask_library",
  "list_library",
  "list_collections",
  "list_watches",
  "check_watches",
  "preview_watch",
] as const;

const WRITE_NON_DESTRUCTIVE_TOOLS = [
  "save_paper",
  "like_paper",
  "create_collection",
  "add_to_collection",
  "create_watch",
  "update_watch",
] as const;

const DESTRUCTIVE_TOOLS = [
  "unsave_paper",
  "remove_from_collection",
  "delete_watch",
] as const;

const ALL_TOOLS = [
  ...READ_ONLY_TOOLS,
  ...WRITE_NON_DESTRUCTIVE_TOOLS,
  ...DESTRUCTIVE_TOOLS,
];

function buildTools(): Map<string, CapturedTool> {
  const { server, tools } = makeFakeServer();
  registerAllTools(server);
  return tools;
}

const TOOLS = buildTools();

function toolFor(name: string): CapturedTool {
  const t = TOOLS.get(name);
  if (!t) throw new Error(`tool not registered: ${name}`);
  return t;
}

describe("tool registry surface", () => {
  it("registers exactly the 25 expected tools", () => {
    assert.strictEqual(TOOLS.size, 25);
    assert.strictEqual(ALL_TOOLS.length, 25);
    for (const name of ALL_TOOLS) {
      assert.ok(TOOLS.has(name), `expected tool "${name}" to be registered`);
    }
  });

  it("has no unexpected tools beyond the M2 table", () => {
    const expected = new Set<string>(ALL_TOOLS);
    for (const name of TOOLS.keys()) {
      assert.ok(expected.has(name), `unexpected tool registered: "${name}"`);
    }
  });
});

describe("tool titles", () => {
  for (const name of ALL_TOOLS) {
    it(`${name} has a non-empty title`, () => {
      const { title } = toolFor(name);
      assert.strictEqual(
        typeof title,
        "string",
        `${name} must have a string title`,
      );
      assert.ok(
        (title ?? "").trim().length > 0,
        `${name} must have a non-empty title`,
      );
    });
  }
});

describe("tool annotations match the M2 hint table", () => {
  for (const name of READ_ONLY_TOOLS) {
    it(`${name} is readOnlyHint:true, destructiveHint:false`, () => {
      const { annotations } = toolFor(name);
      assert.ok(annotations, `${name} must have annotations`);
      assert.strictEqual(annotations?.readOnlyHint, true);
      assert.strictEqual(annotations?.destructiveHint, false);
    });
  }

  for (const name of WRITE_NON_DESTRUCTIVE_TOOLS) {
    it(`${name} is readOnlyHint:false, destructiveHint:false`, () => {
      const { annotations } = toolFor(name);
      assert.ok(annotations, `${name} must have annotations`);
      assert.strictEqual(annotations?.readOnlyHint, false);
      assert.strictEqual(annotations?.destructiveHint, false);
    });
  }

  for (const name of DESTRUCTIVE_TOOLS) {
    it(`${name} is readOnlyHint:false, destructiveHint:true`, () => {
      const { annotations } = toolFor(name);
      assert.ok(annotations, `${name} must have annotations`);
      assert.strictEqual(annotations?.readOnlyHint, false);
      assert.strictEqual(annotations?.destructiveHint, true);
    });
  }
});

describe("tool name-length audit (<= 64 chars)", () => {
  for (const name of TOOLS.keys()) {
    it(`${name} is within the 64-char MCP name budget`, () => {
      assert.ok(
        name.length <= 64,
        `tool name "${name}" is ${name.length} chars, exceeds 64`,
      );
    });
  }
});
