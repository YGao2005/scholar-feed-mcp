/**
 * SERVER_INSTRUCTIONS <-> backend contract guard.
 *
 * The instructions block is the highest-leverage prompt in the product: a wrong
 * call shape there is a guaranteed error for every agent that follows the
 * documented deep-research loop. Step 4 shipped as a bare
 * `search_papers(sort="trending")`, which 422'd on every invocation because the
 * backend requires `q` unless `anchor_paper_id` / `scope_to_citations_of` is set.
 *
 * Unit tests cannot reach the backend, so these assert the property that made
 * the bug possible: any `search_papers(...)` call shape WRITTEN IN the
 * instructions must carry q= (or one of the two id params that stand in for it).
 * That is the invariant, not the literal wording — so the guard survives a
 * rewrite of the prose but still fails if someone reintroduces a q-less example.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SERVER_INSTRUCTIONS } from "../server-info.js";

/** Every `search_papers(...)` call shape spelled out in the instructions. */
function searchPapersCallShapes(text: string): string[] {
  return [...text.matchAll(/search_papers\(([^)]*)\)/g)].map((m) => m[1]);
}

describe("SERVER_INSTRUCTIONS backend contract", () => {
  it("documents at least one search_papers call (the loop's entry point)", () => {
    assert.ok(
      searchPapersCallShapes(SERVER_INSTRUCTIONS).length > 0,
      "instructions must still teach search_papers",
    );
  });

  it("never documents a search_papers call that the backend would 422", () => {
    for (const args of searchPapersCallShapes(SERVER_INSTRUCTIONS)) {
      const satisfiesQueryRequirement =
        /\bq\s*=/.test(args) ||
        /\banchor_paper_id\s*=/.test(args) ||
        /\bscope_to_citations_of\s*=/.test(args);

      assert.ok(
        satisfiesQueryRequirement,
        `search_papers(${args}) omits q= / anchor_paper_id= / scope_to_citations_of=. ` +
          `The backend rejects that with HTTP 422 ("q is required when anchor_paper_id ` +
          `and scope_to_citations_of are not set"), so every agent following the ` +
          `documented loop would hit a hard error. Add q= to the example.`,
      );
    }
  });

  it("does not advertise sort= as a standalone topic-free feed", () => {
    // The specific misreading that produced the bug: treating sort='trending'
    // as a feed you can call bare, rather than a reranker over q's matches.
    assert.doesNotMatch(
      SERVER_INSTRUCTIONS,
      /search_papers\(\s*sort\s*=/,
      "a bare search_papers(sort=...) example always 422s; keep q= in the example",
    );
  });
});
