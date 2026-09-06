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
import { buildServerInfo, SERVER_INSTRUCTIONS } from "./server-info.js";

// Handle subcommands before starting the MCP server
if (process.argv[2] === "init") {
  const { runInit } = await import("./init.js");
  await runInit();
  process.exit(0);
}

if (process.argv[2] === "--version" || process.argv[2] === "-v") {
  const require = createRequire(import.meta.url);
  const { version: v } = require("../package.json") as { version: string };
  // Intentional stdout write for a CLI flag (the server never runs in this path —
  // we process.exit below). process.stdout.write, not console.log, so the stdout-
  // hygiene test can ban console.log everywhere in the server runtime files.
  process.stdout.write(`scholar-feed-mcp v${v}\n`);
  process.exit(0);
}

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const server = new McpServer(buildServerInfo(version), {
  instructions: SERVER_INSTRUCTIONS,
});

registerAllTools(server);

async function main(): Promise<void> {
  if (!process.env.SF_API_KEY) {
    console.error(
      "Scholar Feed MCP: running without API key (anonymous mode, 200 calls/month).\n" +
        "For a higher quota (500/month per account) and your library, set SF_API_KEY in your MCP config.\n" +
        "Get a free key at https://www.scholarfeed.org/settings",
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Scholar Feed MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("Fatal error in main():", err);
  process.exit(1);
});
