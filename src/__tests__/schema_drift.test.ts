/**
 * Response-shape drift gate.
 *
 * WHY THIS EXISTS: `paperObject` here and `LEAN_FIELDS` in the backend's
 * api/routers/public.py are two hand-maintained field lists, in two separate repos, with
 * nothing linking them. On 2026-09-03 they had already drifted — paperObject declared 25
 * fields while the lean default returned 15 — and nothing noticed, because nothing compared
 * them. The first run of scripts/schema-sync.mjs immediately found `n_authors` being
 * returned by list_library and declared nowhere.
 *
 * ONE DIRECTION ONLY: this asserts observed ⊆ declared. Every field the backend actually
 * sends must appear in the schema, because an undeclared field is one an agent cannot see
 * in tools/list and therefore will not use.
 *
 * The reverse (declared ⊆ observed) is deliberately NOT asserted, and that is not laziness —
 * it would fire falsely. The probes run in lean mode, so `arxiv_url` / `pdf_url` /
 * `primary_category` / `institution_tags` are legitimately absent (verbose-only), and
 * `note_text` is absent whenever the probed papers happen to have no note. Declaring a field
 * that a given call does not return is correct behaviour for an optional field; returning one
 * that is undeclared is not.
 *
 * The fixture is refreshed manually by `npm run schema:sync` (needs network + a live API).
 * This test reads only the committed fixture, so CI stays offline.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server-http.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "fixtures/observed-fields.json");

interface Observed {
  tool: string;
  envelopeKey: string;
  rows: number;
  fields: string[];
}

interface Fixture {
  syncedAt: string;
  base: string;
  observed: Observed[];
}

interface ToolDef {
  name: string;
  outputSchema?: {
    properties?: Record<
      string,
      { items?: { properties?: Record<string, unknown> } }
    >;
  };
}

function parseMcp(contentType: string, body: string): { result?: unknown } {
  if (contentType.includes("application/json")) return JSON.parse(body);
  const data = body
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  assert.ok(data.length > 0, `no SSE data lines:\n${body}`);
  return JSON.parse(data[data.length - 1]);
}

describe("declared schema vs observed responses", () => {
  let server: Server;
  let tools: Map<string, ToolDef>;
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;

  before(async () => {
    const app = createApp();
    await new Promise<void>((r) => {
      server = app.listen(0, () => r());
    });
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    const env = parseMcp(
      res.headers.get("content-type") ?? "",
      await res.text(),
    );
    tools = new Map(
      (env.result as { tools: ToolDef[] }).tools.map((t) => [t.name, t]),
    );
  });

  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("has a non-empty fixture", () => {
    assert.ok(
      fixture.observed.length > 0,
      "observed-fields.json is empty — run `npm run schema:sync`",
    );
  });

  for (const entry of JSON.parse(readFileSync(FIXTURE, "utf8"))
    .observed as Observed[]) {
    it(`${entry.tool}: every field it returns under "${entry.envelopeKey}" is declared`, () => {
      const tool = tools.get(entry.tool);
      assert.ok(tool, `${entry.tool} is not registered`);
      const declared = new Set(
        Object.keys(
          tool.outputSchema?.properties?.[entry.envelopeKey]?.items
            ?.properties ?? {},
        ),
      );
      assert.ok(
        declared.size > 0,
        `${entry.tool} declares no item properties under "${entry.envelopeKey}" — ` +
          `either the envelope key is wrong or the schema lost its shape`,
      );
      const undeclared = entry.fields.filter((f) => !declared.has(f));
      assert.deepStrictEqual(
        undeclared,
        [],
        `${entry.tool} returns field(s) that no schema declares: ${undeclared.join(", ")}.\n` +
          `  An undeclared field is invisible in tools/list, so an agent will not use it.\n` +
          `  Add it to paperObject in src/tools/_output.ts (fixture synced ${fixture.syncedAt}).`,
      );
    });
  }
});
