/**
 * Interactive setup wizard for Scholar Feed MCP.
 *
 * Usage: npx scholar-feed-mcp init
 *
 * Prompts for API key and MCP client, then configures the appropriate
 * config file or runs the setup command. No external dependencies —
 * uses Node.js built-ins only.
 */

import { createInterface } from "readline";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";

const rl = createInterface({ input: process.stdin, output: process.stderr });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printStep(step: number, msg: string): void {
  console.error(`\n[${step}/3] ${msg}`);
}

async function verifyKey(apiKey: string): Promise<boolean> {
  const baseUrl =
    process.env.SF_API_BASE_URL ??
    "https://api.scholarfeed.org/api/v1";
  try {
    const res = await fetch(`${baseUrl}/public/health`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      console.error(`  Connected! Plan: ${data.plan}, Key: ${data.key_name ?? "(unnamed)"}`);
      return true;
    }
    console.error(`  API returned ${res.status} — check your key.`);
    return false;
  } catch (e) {
    console.error(`  Could not reach API: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

function mergeJsonConfig(filePath: string, serverConfig: Record<string, unknown>): void {
  let existing: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      // If the file is malformed, overwrite it
    }
  }

  const servers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  servers["scholar-feed"] = serverConfig;
  existing.mcpServers = servers;

  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n");
}

export async function runInit(): Promise<void> {
  console.error("Scholar Feed MCP — Setup Wizard\n");
  console.error("Get your API key at: https://www.scholarfeed.org/settings\n");

  // Step 1: API key
  printStep(1, "Enter your API key");
  const apiKey = await ask("  API key (sf_...): ");

  if (!apiKey.startsWith("sf_")) {
    console.error("  Error: API key must start with 'sf_'. Get one at https://www.scholarfeed.org/settings");
    rl.close();
    process.exit(1);
  }

  // Step 2: Choose client
  printStep(2, "Choose your MCP client");
  console.error("  1) Claude Code");
  console.error("  2) Cursor");
  console.error("  3) Claude Desktop");
  const choice = await ask("  Choice (1/2/3): ");

  // Step 3: Configure
  printStep(3, "Configuring...");

  const serverBlock = {
    command: "npx",
    args: ["-y", "scholar-feed-mcp"],
    env: { SF_API_KEY: apiKey },
  };

  switch (choice) {
    case "1": {
      // Claude Code — use CLI
      try {
        execSync(
          `claude mcp add scholar-feed -e SF_API_KEY=${apiKey} -- npx -y scholar-feed-mcp`,
          { stdio: "inherit" }
        );
        console.error("  Added to Claude Code. Use 'check_connection' tool to verify.");
      } catch {
        console.error("  'claude' CLI not found. Install Claude Code first: https://docs.anthropic.com/claude-code");
        console.error("  Or run manually:");
        console.error(`  claude mcp add scholar-feed -e SF_API_KEY=${apiKey} -- npx -y scholar-feed-mcp`);
      }
      break;
    }
    case "2": {
      // Cursor — .cursor/mcp.json in cwd
      const filePath = join(process.cwd(), ".cursor", "mcp.json");
      mergeJsonConfig(filePath, serverBlock);
      console.error(`  Written to ${filePath}`);
      console.error("  Restart Cursor to activate.");
      break;
    }
    case "3": {
      // Claude Desktop — platform-specific config
      const p = platform();
      let configPath: string;
      if (p === "darwin") {
        configPath = join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
      } else if (p === "win32") {
        configPath = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
      } else {
        configPath = join(homedir(), ".config", "claude", "claude_desktop_config.json");
      }
      mergeJsonConfig(configPath, serverBlock);
      console.error(`  Written to ${configPath}`);
      console.error("  Restart Claude Desktop to activate.");
      break;
    }
    default: {
      console.error("  Invalid choice. Run 'npx scholar-feed-mcp init' again.");
      rl.close();
      process.exit(1);
    }
  }

  // Verify connection
  console.error("\n  Verifying connection...");
  await verifyKey(apiKey);

  rl.close();
  console.error("\nDone! Try asking: \"Search for papers on test-time compute scaling\"");
}
