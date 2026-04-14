#!/usr/bin/env node
/**
 * Scholar Feed MCP Server
 *
 * Entry point that creates the McpServer, registers all tools, and starts
 * the stdio transport. All logging goes to stderr — never stdout (which is
 * the JSON-RPC channel and must not be corrupted).
 *
 * Subcommands:
 *   init — interactive setup wizard (runs instead of MCP server)
 */

import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

// Handle subcommands before starting the MCP server
if (process.argv[2] === "init") {
  const { runInit } = await import("./init.js");
  await runInit();
  process.exit(0);
}

if (process.argv[2] === "--version" || process.argv[2] === "-v") {
  const require = createRequire(import.meta.url);
  const { version: v } = require("../package.json") as { version: string };
  console.log(`scholar-feed-mcp v${v}`);
  process.exit(0);
}

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const server = new McpServer({
  name: "scholar-feed",
  version,
});

registerAllTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Scholar Feed MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("Fatal error in main():", err);
  process.exit(1);
});
