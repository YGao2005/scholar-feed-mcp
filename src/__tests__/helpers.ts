/**
 * Test helpers — a fake McpServer that captures tool registrations, and a
 * fetch stub for asserting outgoing requests. No external test dependencies;
 * this file is not a test itself (the runner only picks up *.test.ts).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface CapturedTool {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

/**
 * A minimal McpServer double that records registerTool(name, def, handler).
 * Cast to McpServer so the real register functions accept it; at runtime only
 * registerTool is exercised.
 */
export function makeFakeServer(): {
  server: McpServer;
  tools: Map<string, CapturedTool>;
} {
  const tools = new Map<string, CapturedTool>();
  const fake = {
    registerTool(
      name: string,
      def: { description: string; inputSchema: Record<string, unknown> },
      handler: ToolHandler
    ): void {
      tools.set(name, {
        description: def.description,
        inputSchema: def.inputSchema,
        handler,
      });
    },
  };
  return { server: fake as unknown as McpServer, tools };
}

export interface CapturedRequest {
  url: string;
  init: RequestInit | undefined;
}

/**
 * Replace globalThis.fetch with a stub that records every request and returns
 * a canned response (or throws). Call restore() when done.
 */
export function stubFetch(opts?: {
  status?: number;
  json?: unknown;
  body?: string;
  throwError?: Error;
}): { calls: CapturedRequest[]; restore: () => void } {
  const calls: CapturedRequest[] = [];
  const original = globalThis.fetch;
  const status = opts?.status ?? 200;
  const payload = opts?.body ?? JSON.stringify(opts?.json ?? { ok: true });

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    calls.push({ url: String(input), init });
    if (opts?.throwError) throw opts.throwError;
    return new Response(payload, {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Read a header value off a captured request's plain-object headers. */
export function headerOf(req: CapturedRequest, name: string): string | undefined {
  const headers = (req.init?.headers ?? {}) as Record<string, string>;
  return headers[name];
}
