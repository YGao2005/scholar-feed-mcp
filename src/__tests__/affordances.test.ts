/**
 * Account-affordance tests — the one-time nudge shown to anonymous stdio callers
 * on the FREE research surface (src/tools/_affordances.ts).
 *
 * The counter is module state, so every test resets it first; without that the
 * cases leak into each other in file order and a green run proves nothing.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  fencedWithNextSteps,
  accountAffordance,
  __resetAccountAffordance,
} from "../tools/_affordances.js";
import { UNTRUSTED_END } from "../tools/_untrusted.js";
import { runWithCreds } from "../http/credentials.js";

const THRESHOLD = 5;
const RESULT = { papers: [{ arxiv_id: "2501.12948v1" }] };

let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.SF_API_KEY;
  delete process.env.SF_API_KEY; // anonymous stdio is the eligible caller
  __resetAccountAffordance();
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.SF_API_KEY;
  else process.env.SF_API_KEY = savedKey;
});

describe("account affordance — when it fires", () => {
  it("stays silent below the threshold", () => {
    for (let i = 1; i < THRESHOLD; i++) {
      assert.strictEqual(accountAffordance(), "", `call ${i} must be silent`);
    }
  });

  it("fires on exactly the Nth call, then never again", () => {
    for (let i = 1; i < THRESHOLD; i++) accountAffordance();

    const first = accountAffordance();
    assert.notStrictEqual(first, "", "the Nth call must produce the affordance");
    assert.match(first, /calling Scholar Feed anonymously/);

    for (let i = 0; i < 10; i++) {
      assert.strictEqual(
        accountAffordance(),
        "",
        "the affordance must be once per process, not per call",
      );
    }
  });
});

describe("account affordance — who must never see it", () => {
  it("never fires for an authenticated caller, however many calls they make", () => {
    process.env.SF_API_KEY = "sf_test_key";
    for (let i = 0; i < THRESHOLD * 3; i++) {
      assert.strictEqual(accountAffordance(), "");
    }
  });

  it("never fires on the remote transport, which has no per-user counter", () => {
    const creds = { apiKey: null, sessionId: "11111111-2222-3333-4444-555555555555" };
    for (let i = 0; i < THRESHOLD * 3; i++) {
      assert.strictEqual(
        runWithCreds(creds, () => accountAffordance()),
        "",
        "a shared Workers isolate must never accumulate across callers",
      );
    }
  });

  it("remote calls do not advance the stdio counter", () => {
    const creds = { apiKey: null, sessionId: "11111111-2222-3333-4444-555555555555" };
    for (let i = 0; i < THRESHOLD * 3; i++) {
      runWithCreds(creds, () => accountAffordance());
    }
    // If remote traffic had ticked the counter, the very first stdio call would fire.
    assert.strictEqual(accountAffordance(), "", "ineligible callers must not tick");
  });
});

describe("account affordance — the signup URL", () => {
  it("is tagged mcpfree and carries an 8-hex session prefix", () => {
    for (let i = 1; i < THRESHOLD; i++) accountAffordance();
    const line = accountAffordance();

    // Parse the URL rather than regex-matching the message: an unanchored pattern
    // passes on https://evil.test/?u=https://www.scholarfeed.org/settings...
    const found = line.match(/https:\/\/\S+/);
    assert.ok(found, "the affordance must hand the agent a URL");
    const url = new URL(found[0]);
    assert.strictEqual(url.origin, "https://www.scholarfeed.org");
    assert.strictEqual(url.pathname, "/settings");
    assert.strictEqual(url.searchParams.get("ref"), "mcpfree");
    assert.match(url.searchParams.get("s") ?? "", /^[0-9a-f]{8}$/);
  });

  it("uses a ref distinct from the gate CTA, so the two stages stay separable", () => {
    for (let i = 1; i < THRESHOLD; i++) accountAffordance();
    assert.doesNotMatch(accountAffordance(), /ref=mcp403/);
  });
});

describe("account affordance — placement in the payload", () => {
  it("lands outside the untrusted fence", () => {
    for (let i = 1; i < THRESHOLD; i++) fencedWithNextSteps(RESULT, "search");
    const out = fencedWithNextSteps(RESULT, "search");

    const fenceEnd = out.indexOf(UNTRUSTED_END);
    const nudge = out.indexOf("calling Scholar Feed anonymously");
    assert.ok(fenceEnd >= 0, "the fence must still close");
    assert.ok(nudge > fenceEnd, "trusted server text must never sit inside the fence");
  });

  it("still closes on the fence, with a header, when there is no next-steps footer", () => {
    // No arXiv id anywhere => nextStepsFooter() returns "".
    const empty = { papers: [] };
    for (let i = 1; i < THRESHOLD; i++) fencedWithNextSteps(empty, "search");
    const out = fencedWithNextSteps(empty, "search");

    const fenceEnd = out.indexOf(UNTRUSTED_END);
    const header = out.indexOf("Scholar Feed next steps");
    const nudge = out.indexOf("calling Scholar Feed anonymously");
    assert.ok(fenceEnd >= 0);
    assert.ok(header > fenceEnd, "the affordance must be introduced by the header");
    assert.ok(nudge > header);
  });

  it("does not alter the payload before the threshold", () => {
    const out = fencedWithNextSteps(RESULT, "search");
    assert.doesNotMatch(out, /calling Scholar Feed anonymously/);
    assert.ok(out.includes(UNTRUSTED_END));
  });
});
