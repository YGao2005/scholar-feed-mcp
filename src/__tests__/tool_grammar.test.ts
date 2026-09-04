/**
 * Tool-name grammar gate.
 *
 * WHY THIS EXISTS: 27 tools currently use NINETEEN distinct verb prefixes, so the verb
 * carries almost no information. Measured symptoms as of 2026-09-03:
 *
 *   - `find_` means two different things: find_author is a SEARCH, find_gaps is an ANALYSIS.
 *   - `check_` means two different things: check_watches LISTS hits, check_drift ANALYSES.
 *   - `get_` spans a by-id fetch (get_paper) and heavy analysis (get_foundational_lineage).
 *   - co_author_graph has no verb at all.
 *   - Five analysis tools, five naming conventions.
 *
 * The empirical tell that the names are underloaded: SIXTEEN of 27 descriptions have to name
 * another tool to be understood (like_paper explains itself against save_paper, save_paper
 * against add_to_collection, list_library against annotate_paper). A name that needs a
 * disambiguating sentence is a name doing too little — and that sentence is paid for in
 * every session's context.
 *
 * WHY IT IS FORWARD-ONLY: the tool names are a PUBLISHED API — npm, the MCP registry,
 * claude.ai connectors, and ~8k Smithery uses. Renaming breaks live clients, so every
 * existing name is grandfathered below and nothing is renamed. The gate exists so that
 * tool #28 has to conform, which is what stops 19 prefixes becoming 25.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerAllTools } from "../tools/index.js";
import { makeFakeServer } from "./helpers.js";

/**
 * The grammar. A new tool's name MUST start with one of these.
 *
 *   get_       fetch one identified thing (get_paper)
 *   search_    query the corpus (search_papers)
 *   list_      enumerate what belongs to the caller (list_library)
 *   analyze_   derived / expensive / interpretive output (analyze_drift)
 *   ask_       LLM synthesis over a scoped set (ask_library)
 *   create_ / update_ / delete_   lifecycle mutations
 *   annotate_  attach the caller's own judgement to a thing
 *
 * Deliberately absent: find_ (ambiguous between search and analysis) and check_ (ambiguous
 * between list and analysis). Those two are the source of the current confusion, so they
 * are not available to new tools even though existing users of them are grandfathered.
 */
const APPROVED_PREFIXES = [
  "get_",
  "search_",
  "list_",
  "analyze_",
  "ask_",
  "create_",
  "update_",
  "delete_",
  "annotate_",
] as const;

/**
 * FROZEN. Every tool name that existed when the grammar landed (2026-09-03).
 *
 * Do NOT add to this set. Adding a name here to make CI pass defeats the entire gate — if a
 * new tool cannot fit the grammar, the right move is to rename the tool (it is not published
 * yet) or to widen APPROVED_PREFIXES on purpose, in the PR, with the reason stated.
 *
 * The comment beside each non-conforming name is what it WOULD be called under the grammar,
 * kept as a record for a future major version that can afford to break clients.
 */
const LEGACY_NAMES: ReadonlySet<string> = new Set([
  // conforming already
  "search_papers",
  "get_paper",
  "get_citations",
  "list_library",
  "list_collections",
  "list_watches",
  "ask_library",
  "create_collection",
  "create_watch",
  "update_watch",
  "delete_watch",
  "annotate_paper",
  // grandfathered — non-conforming, would be renamed in a major
  "find_author", // -> search_authors      (it is a search, not an analysis)
  "find_gaps", // -> analyze_gaps
  "check_drift", // -> analyze_drift
  "check_watches", // -> list_watch_hits    (it lists, it does not analyse)
  "get_field_orientation", // -> analyze_field
  "get_foundational_lineage", // -> analyze_lineage
  "co_author_graph", // -> analyze_co_authors (no verb at all)
  "fetch_fulltext", // -> get_fulltext
  "embed_text", // -> analyze_text
  "save_paper", // -> create_save / update_library
  "unsave_paper", // -> delete_save
  "like_paper", // -> create_like
  "add_to_collection", // -> update_collection
  "remove_from_collection", // -> update_collection
  "preview_watch", // -> analyze_watch
]);

function registeredToolNames(): string[] {
  const { server, tools } = makeFakeServer();
  registerAllTools(server);
  return [...tools.keys()];
}

describe("tool name grammar", () => {
  it("every tool is grandfathered or uses an approved prefix", () => {
    const offenders = registeredToolNames().filter(
      (name) =>
        !LEGACY_NAMES.has(name) &&
        !APPROVED_PREFIXES.some((p) => name.startsWith(p)),
    );
    assert.deepStrictEqual(
      offenders,
      [],
      `tool name(s) outside the grammar: ${offenders.join(", ")}.\n` +
        `  Approved prefixes: ${APPROVED_PREFIXES.join(", ")}\n` +
        `  Rename the tool rather than adding it to LEGACY_NAMES — that set is frozen at the\n` +
        `  names that were already published. See CONTRIBUTING.md > Tool naming.`,
    );
  });

  it("the legacy set stays frozen", () => {
    // If this fails, someone grew LEGACY_NAMES instead of conforming — the exact move the
    // gate exists to prevent. It is the same failure as bumping ALL_TOOLS.length: a gate
    // you can satisfy by editing the gate is not a gate.
    assert.strictEqual(
      LEGACY_NAMES.size,
      27,
      "LEGACY_NAMES must stay frozen at the 27 names published before the grammar landed",
    );
  });

  it("every legacy name is actually registered", () => {
    // Keeps the frozen set honest: a name deregistered in a future major should be removed
    // from LEGACY_NAMES too, so the set never silently grants amnesty to a name nobody uses.
    const registered = new Set(registeredToolNames());
    const stale = [...LEGACY_NAMES].filter((n) => !registered.has(n));
    assert.deepStrictEqual(
      stale,
      [],
      `LEGACY_NAMES lists tool(s) that are no longer registered: ${stale.join(", ")}`,
    );
  });

  it("does not admit the two ambiguous prefixes for new tools", () => {
    // Guard against quietly re-opening the exact ambiguity documented above.
    for (const banned of ["find_", "check_"]) {
      assert.ok(
        !APPROVED_PREFIXES.some((p) => p === banned),
        `${banned} must not be an approved prefix — it is ambiguous between search/list and analysis`,
      );
    }
  });
});
