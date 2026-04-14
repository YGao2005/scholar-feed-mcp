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
