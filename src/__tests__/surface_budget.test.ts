/**
 * Tool-surface budget gate.
 *
 * WHY THIS EXISTS: `tools/list` is a FIXED COST paid by every session before any work
 * happens — the client loads all 27 tool definitions whether it searches papers or manages
 * watches. Measured 2026-09-03 it was 123,031 chars (~30,757 tokens), and the composition
 * was not what anyone assumed: outputSchema 50.4%, inputSchema 27.2%, description only
 * 17.7%. A quarter of the whole surface was byte-identical duplicated schemas.
 *
 * WHY A GATE AND NOT A CLEANUP: the cleanup already happened once. `src/tools/index.ts`
 * documents a v3 pass that deregistered ELEVEN tools (find_similar, whats_trending,
 * batch_lookup, export_bibtex, discover_authors, ... absorbed or demoted). The surface grew
 * straight back to 27, because the only thing watching it was `ALL_TOOLS.length === 27` —
 * an assertion that ratchets UPWARD. Adding a tool means bumping the number, so it records
 * growth instead of resisting it:
 *
 *     25 -> 26   check_drift       2026-06-10
 *     26 -> 27   annotate_paper    2026-09-03
 *
 * This file is the missing counter-pressure, in the same spirit as the coverage floors in
 * `.c8rc.json`. It does not forbid growth; it forces growth to be a decision.
 *
 * The measurement goes through the REAL Streamable-HTTP transport rather than
 * makeFakeServer, because only the transport runs the Zod -> JSON Schema conversion. The
 * fake server captures raw Zod shapes, which are not what a client pays for.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server-http.js";

const PROTOCOL_VERSION = "2025-11-25";

/**
 * MAY ONLY FALL.
 *
 * Raising either number is the change under review, not a side effect of one. If a new
 * tool or a longer description pushes past these, the options in preference order are:
 * (1) fit within the budget, (2) subtract something that is not earning its bytes — the
 * zero-call report at `backend/scripts/tool_usage_report.py` names candidates, (3) argue
 * for the raise explicitly in the PR.
 *
 * Both numbers count `JSON.stringify(tool)` — name + title + description + inputSchema +
 * outputSchema + annotations, i.e. what the client actually receives. Do not compare them
 * against a description-only or schema-only figure; that mistake set this ceiling wrong on
 * the first attempt.
 *
 * Baseline history (27 tools throughout):
 *   123,031  2026-09-03  pre-gate
 *    96,950  2026-09-03  one paper array per envelope (was papers+hits+results shared 5x)
 *    96,087  2026-09-03  removed descriptions of removed features
 *    96,417  2026-09-03  declared n_authors (schema-sync found it returned but undeclared)
 *    93,214  2026-09-03  stopped re-documenting params in tool descriptions
 */
const SURFACE_CEILING_CHARS = 95_000;

/**
 * No single tool may dominate. search_papers is 11,649 chars — still the largest, and it has
 * earned room (2,132 of ~4,600 MCP calls over 14 days), but not unbounded room.
 *
 * A tool description must NOT restate what a parameter's own `description` already says. Both
 * are shipped to the client, so duplicated guidance is paid for twice and drifts
 * independently. search_papers had 18 of its 27 params documented in both places — 4,825
 * chars of param text mirrored in prose — which is how its description reached 4,407 chars.
 * Deduplicating it took that to 1,542 with nothing lost: every cross-param trap removed from
 * the description was verified to already exist in the param that owns it. A tool description
 * should carry only what NO single parameter can say.
 */
const PER_TOOL_CEILING_CHARS = 12_000;

/**
 * Per-tool DESCRIPTION ceiling, gated separately from total size because descriptions grow by
 * a different mechanism: someone adds a paragraph rather than a parameter, and the prose is
 * where the duplication accumulates.
 *
 * The largest legitimate description is check_drift's (~2,155 chars). Most of its length is
 * earned — it explains that the grounding gate verifies quote text but NOT attribution, and
 * that no end-to-end precision has been measured, which is what stops an agent repeating a
 * supersession verdict as fact. That guidance belongs to no parameter, so it stays.
 *
 * If a description breaches this, the first question is not "how do I compress prose" but
 * "which parameter already owns this?" — see the note on PER_TOOL_CEILING_CHARS above.
 */
const PER_DESCRIPTION_CEILING_CHARS = 2_300;

interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: {
    properties?: Record<string, { type?: string } | undefined>;
  };
}

/**
 * Which of the paper-array keys a tool's outputSchema declares.
 *
 * Reads the PARSED schema. An earlier version regex-matched the serialized JSON for
 * `"papers":{"type":"array"` and silently matched nothing: once a field carries a
 * `.describe()`, `description` is serialized FIRST, so the pattern never saw the tools it
 * was written to check and the assertion below passed vacuously. Caught only by probing the
 * built bundle by hand. Do not reintroduce a string match here.
 */
function paperArrayKeys(tool: ToolDef): string[] {
  const props = tool.outputSchema?.properties ?? {};
  // Only these three; `not_found` is also type:array (of strings) and must not count.
  return ["papers", "hits", "results"].filter(
    (k) => props[k]?.type === "array",
  );
}

function parseMcpResponse(
  contentType: string,
  body: string,
): { result?: unknown } {
  if (contentType.includes("application/json")) {
    return JSON.parse(body);
  }
  const dataPayloads = body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((s) => s.length > 0);
  assert.ok(
    dataPayloads.length > 0,
    `SSE response carried no data lines:\n${body}`,
  );
  return JSON.parse(dataPayloads[dataPayloads.length - 1]);
}

/** Per-tool byte cost, largest first — the shape of any budget failure. */
function breakdown(tools: ToolDef[]): string {
  return tools
    .map((t) => ({ name: t.name, size: JSON.stringify(t).length }))
    .sort((a, b) => b.size - a.size)
    .map((t) => `    ${t.name.padEnd(26)}${String(t.size).padStart(7)}`)
    .join("\n");
}

describe("tool surface budget", () => {
  let server: Server;
  let tools: ToolDef[];
  let totalChars: number;

  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    const envelope = parseMcpResponse(
      res.headers.get("content-type") ?? "",
      await res.text(),
    );
    tools = (envelope.result as { tools: ToolDef[] }).tools;
    totalChars = JSON.stringify(tools).length;

    // Always report, so the current cost is visible in ordinary test output rather than
    // only when it breaks.
    console.error(
      `\n  [surface] ${tools.length} tools, ${totalChars.toLocaleString()} chars ` +
        `(~${Math.round(totalChars / 4).toLocaleString()} tokens), ` +
        `ceiling ${SURFACE_CEILING_CHARS.toLocaleString()}\n`,
    );
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("keeps the whole surface within budget", () => {
    assert.ok(
      totalChars <= SURFACE_CEILING_CHARS,
      `tools/list is ${totalChars.toLocaleString()} chars, over the ` +
        `${SURFACE_CEILING_CHARS.toLocaleString()} ceiling by ` +
        `${(totalChars - SURFACE_CEILING_CHARS).toLocaleString()}.\n` +
        `  Every session pays this before doing any work. Per-tool cost:\n${breakdown(tools)}\n` +
        `  Subtract something, or raise SURFACE_CEILING_CHARS deliberately in the PR.`,
    );
  });

  it("keeps any single tool within budget", () => {
    const over = tools
      .map((t) => ({ name: t.name, size: JSON.stringify(t).length }))
      .filter((t) => t.size > PER_TOOL_CEILING_CHARS);
    assert.deepStrictEqual(
      over,
      [],
      `tool(s) over the ${PER_TOOL_CEILING_CHARS.toLocaleString()}-char per-tool ceiling: ` +
        over.map((t) => `${t.name} (${t.size.toLocaleString()})`).join(", "),
    );
  });

  it("keeps every tool description within budget", () => {
    const over = tools
      .map((t) => ({ name: t.name, size: (t.description ?? "").length }))
      .filter((t) => t.size > PER_DESCRIPTION_CEILING_CHARS)
      .sort((a, b) => b.size - a.size);
    assert.deepStrictEqual(
      over,
      [],
      `description(s) over the ${PER_DESCRIPTION_CEILING_CHARS.toLocaleString()}-char ceiling: ` +
        over.map((t) => `${t.name} (${t.size.toLocaleString()})`).join(", ") +
        `.\n  Before compressing prose, check which PARAMETER already documents this — both the` +
        `\n  description and every param description are shipped, so duplicated guidance is paid` +
        `\n  for twice. search_papers went 4,407 -> 1,542 chars that way with nothing lost.`,
    );
  });

  it("declares each paper array on exactly one envelope", () => {
    // Regression guard for the 2026-09-03 finding: one shared envelope declared `papers`
    // AND `hits` AND `results`, so paperObject was serialized 15 times across 5 tools, and
    // `results` described a key NOTHING returns. If a tool needs a new array key, give it
    // its own envelope instead of widening a shared one.
    for (const t of tools) {
      const arrays = paperArrayKeys(t);
      assert.ok(
        arrays.length <= 1,
        `${t.name} declares ${arrays.length} paper arrays (${arrays.join(", ")}). ` +
          `Each duplicated paperObject costs ~1,750 chars in EVERY session.`,
      );
    }
  });

  it("actually sees the paper arrays it is checking", () => {
    // Guards the guard. The assertion above is satisfied by BOTH "one array per tool" and
    // "the detector is broken and sees none" — and the first implementation was the latter.
    // Pinning the expected detections means a future refactor of the schema shape breaks
    // loudly instead of turning the check into a no-op.
    const found = tools
      .map((t) => [t.name, paperArrayKeys(t)] as const)
      .filter(([, keys]) => keys.length > 0)
      .map(([name, keys]) => `${name}:${keys.join("+")}`)
      .sort();
    assert.deepStrictEqual(found, [
      "ask_library:papers",
      "check_watches:hits",
      "get_citations:papers",
      "get_field_orientation:papers",
      "get_paper:papers",
      "list_library:papers",
      "search_papers:papers",
    ]);
  });
});
