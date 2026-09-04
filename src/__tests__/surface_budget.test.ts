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
 */
const SURFACE_CEILING_CHARS = 98_000;

/**
 * No single tool may dominate. search_papers is 14,484 chars today — the largest in the
 * surface, with 27 parameters. It is the workhorse (746 of ~1,500 MCP calls over 3 days)
 * so it has earned room, but not unbounded room.
 */
const PER_TOOL_CEILING_CHARS = 15_000;

interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
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

  it("declares each paper array on exactly one envelope", () => {
    // Regression guard for the 2026-09-03 finding: one shared envelope declared `papers`
    // AND `hits` AND `results`, so paperObject was serialized 15 times across 5 tools, and
    // `results` described a key NOTHING returns. If a tool needs a new array key, give it
    // its own envelope instead of widening a shared one.
    for (const t of tools) {
      const schema = JSON.stringify(t.outputSchema ?? {});
      const arrays = ["papers", "hits", "results"].filter((k) =>
        new RegExp(`"${k}":\\s*\\{"type":"array"`).test(schema),
      );
      assert.ok(
        arrays.length <= 1,
        `${t.name} declares ${arrays.length} paper arrays (${arrays.join(", ")}). ` +
          `Each duplicated paperObject costs ~1,750 chars in EVERY session.`,
      );
    }
  });
});
