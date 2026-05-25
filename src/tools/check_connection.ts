/**
 * check_connection tool — DEPRECATED v3.0.0 (KILLED per FND-03 audit).
 *
 * Errors from any real call signal connectivity; the tool adds no value over
 * observing a failed call. 4 calls in the 7-hour audit window, single caller,
 * classic boilerplate-then-search pattern. Deregistered from index.ts.
 * Revival = re-add the register() call in index.ts.
 * See docs/architecture/mcp-v3-surface.md deprecation table.
 */

/**
 * check_connection tool — verify API key and show plan/usage info.
 *
 * Endpoint: GET /public/health
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { client } from "../client.js";

export function register(server: McpServer): void {
  server.registerTool(
    "check_connection",
    {
      description:
        "Verify your Scholar Feed API key is working. Returns connection status, subscription plan, key name, and today's API usage count.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.get<unknown>("/public/health");
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
