/**
 * Interactive setup wizard for Scholar Feed MCP.
 *
 * Usage: npx scholar-feed-mcp init
 *
 * Prompts for an API key (optional) and an MCP client, then configures the
 * appropriate config file or prints the snippet to paste. No external
 * dependencies — uses Node.js built-ins only.
 *
 * Every client launches the same stdio server (`npx -y scholar-feed-mcp`); they
 * differ only in config-file location and the wrapper key:
 *   - Most clients use `mcpServers` (Cursor, Claude Desktop, Windsurf, Gemini
 *     CLI, LM Studio) — handled by mergeMcpServersConfig.
 *   - VS Code uses a `servers` key with an explicit `type: "stdio"`.
 *   - Zed uses a `context_servers` key with a required `source: "custom"`.
 *   - Continue (YAML), JetBrains (UI), and Cline/Roo (UI) can't be safely
 *     written for the user, so we print the snippet to paste instead.
 *
 * Keep this list in sync with README.md and the website /developers picker
 * (frontend/components/dev/McpInstall.tsx).
 */

import { createInterface } from "readline";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir, platform } from "os";

const rl = createInterface({ input: process.stdin, output: process.stderr });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printStep(step: number, total: number, msg: string): void {
  console.error(`\n[${step}/${total}] ${msg}`);
}

async function verifyKey(apiKey: string): Promise<boolean> {
  const baseUrl =
    process.env.SF_API_BASE_URL ?? "https://api.scholarfeed.org/api/v1";
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const res = await fetch(`${baseUrl}/public/health`, { headers });
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      if (apiKey) {
        console.error(
          `  Connected! Plan: ${data.plan}, Key: ${data.key_name ?? "(unnamed)"}`,
        );
      } else {
        console.error(
          `  Connected! Running in anonymous mode (100 calls/day).`,
        );
      }
      return true;
    }
    console.error(`  API returned ${res.status} — check your key.`);
    return false;
  } catch (e) {
    console.error(
      `  Could not reach API: ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }
}

/**
 * Merge a server entry into an existing JSON config under `topKey`, preserving
 * any other servers/keys already present. Reading directly (rather than
 * existsSync-then-read) avoids a check-then-use file race.
 */
function mergeKeyedConfig(
  filePath: string,
  topKey: string,
  serverConfig: Record<string, unknown>,
): void {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    // Missing or malformed — start from an empty config.
  }

  const servers = (existing[topKey] ?? {}) as Record<string, unknown>;
  servers["scholar-feed"] = serverConfig;
  existing[topKey] = servers;

  // mkdirSync({ recursive: true }) is a no-op when the dir already exists, so no
  // existsSync guard is needed — and adding one back would re-introduce the race.
  const dir = dirname(filePath);
  if (dir) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n");
}

/** Standard `mcpServers` clients (Cursor, Claude Desktop, Windsurf, Gemini CLI, LM Studio). */
function mergeMcpServersConfig(
  filePath: string,
  serverConfig: Record<string, unknown>,
): void {
  mergeKeyedConfig(filePath, "mcpServers", serverConfig);
}

/** Claude Desktop's platform-specific config path. */
function claudeDesktopConfigPath(): string {
  const p = platform();
  if (p === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (p === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    );
  }
  return join(homedir(), ".config", "claude", "claude_desktop_config.json");
}

/** Zed's settings.json path (XDG on macOS/Linux, APPDATA on Windows). */
function zedConfigPath(): string {
  if (platform() === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "Zed",
      "settings.json",
    );
  }
  return join(homedir(), ".config", "zed", "settings.json");
}

/** A printed snippet must never contain the real key (stderr lands in scrollback). */
function standardJsonSnippet(hasKey: boolean): string {
  const envLine = hasKey
    ? `,\n      "env": { "SF_API_KEY": "<your-key>" }`
    : "";
  return `{
  "mcpServers": {
    "scholar-feed": {
      "command": "npx",
      "args": ["-y", "scholar-feed-mcp"]${envLine}
    }
  }
}`;
}

function continueYamlSnippet(hasKey: boolean): string {
  const envBlock = hasKey ? `\n    env:\n      SF_API_KEY: <your-key>` : "";
  return `mcpServers:
  - name: scholar-feed
    type: stdio
    command: npx
    args:
      - "-y"
      - scholar-feed-mcp${envBlock}`;
}

export async function runInit(): Promise<void> {
  console.error("Scholar Feed MCP — Setup Wizard\n");

  // Step 1: API key (optional)
  printStep(1, 3, "Enter your API key (optional — press Enter to skip)");
  console.error("  Get a free key at: https://www.scholarfeed.org/settings");
  console.error(
    "  Without a key, you get 100 calls/day. With a key, 1,000/day per account.",
  );
  const apiKey = await ask("  API key (sf_...): ");

  if (apiKey && !apiKey.startsWith("sf_")) {
    console.error(
      "  Error: API key must start with 'sf_'. Get one at https://www.scholarfeed.org/settings",
    );
    rl.close();
    process.exit(1);
  }

  // Step 2: Choose client
  printStep(2, 3, "Choose your MCP client");
  console.error("  Auto-configured:");
  console.error("   1) Claude Code");
  console.error("   2) Cursor");
  console.error("   3) Claude Desktop");
  console.error("   4) VS Code (GitHub Copilot)");
  console.error("   5) Windsurf");
  console.error("   6) Zed");
  console.error("   7) Gemini CLI");
  console.error("   8) LM Studio");
  console.error("  Print snippet to paste:");
  console.error("   9) Continue");
  console.error("  10) JetBrains / PyCharm");
  console.error("  11) Cline / Roo Code");
  const choice = await ask("  Choice (1-11): ");

  // Step 3: Configure
  printStep(3, 3, "Configuring...");

  const env: Record<string, string> = {};
  if (apiKey) {
    env.SF_API_KEY = apiKey;
  }
  const hasKey = Object.keys(env).length > 0;

  // Standard `mcpServers` server entry (Cursor, Claude Desktop, Windsurf, Gemini, LM Studio).
  const serverBlock: Record<string, unknown> = {
    command: "npx",
    args: ["-y", "scholar-feed-mcp"],
  };
  if (hasKey) {
    serverBlock.env = env;
  }

  switch (choice) {
    case "1": {
      // Claude Code — use the CLI. execFileSync (not execSync) passes the
      // user-typed API key as a discrete argv element, so it can never be
      // interpolated into a shell command line — no shell is spawned. (If the
      // 'claude' CLI isn't on PATH, the catch block prints the manual command.)
      const addArgs = [
        "mcp",
        "add",
        "scholar-feed",
        ...(apiKey ? ["-e", `SF_API_KEY=${apiKey}`] : []),
        "--",
        "npx",
        "-y",
        "scholar-feed-mcp",
      ];
      try {
        execFileSync("claude", addArgs, { stdio: "inherit" });
        console.error(
          "  Added to Claude Code. Restart it, then ask it to search for papers to verify.",
        );
      } catch {
        console.error(
          "  'claude' CLI not found. Install Claude Code first: https://docs.anthropic.com/claude-code",
        );
        console.error("  Or run manually:");
        // Print a placeholder, never the real key — stderr ends up in
        // scrollback, screen-shares, and bug reports.
        const keyHint = apiKey ? " -e SF_API_KEY=<your-key>" : "";
        console.error(
          `  claude mcp add scholar-feed${keyHint} -- npx -y scholar-feed-mcp`,
        );
      }
      break;
    }
    case "2": {
      // Cursor — .cursor/mcp.json in cwd
      const filePath = join(process.cwd(), ".cursor", "mcp.json");
      mergeMcpServersConfig(filePath, serverBlock);
      console.error(`  Written to ${filePath}`);
      console.error("  Restart Cursor to activate.");
      break;
    }
    case "3": {
      // Claude Desktop — platform-specific config
      const configPath = claudeDesktopConfigPath();
      mergeMcpServersConfig(configPath, serverBlock);
      console.error(`  Written to ${configPath}`);
      console.error("  Restart Claude Desktop to activate.");
      break;
    }
    case "4": {
      // VS Code (GitHub Copilot) — .vscode/mcp.json in cwd. Different wrapper
      // key (`servers`) and an explicit transport `type`.
      const filePath = join(process.cwd(), ".vscode", "mcp.json");
      const vscodeBlock: Record<string, unknown> = {
        type: "stdio",
        command: "npx",
        args: ["-y", "scholar-feed-mcp"],
      };
      if (hasKey) vscodeBlock.env = env;
      mergeKeyedConfig(filePath, "servers", vscodeBlock);
      console.error(`  Written to ${filePath}`);
      console.error(
        "  Open Copilot Chat and switch to Agent mode, then start the server.",
      );
      break;
    }
    case "5": {
      // Windsurf — ~/.codeium/windsurf/mcp_config.json
      const filePath = join(
        homedir(),
        ".codeium",
        "windsurf",
        "mcp_config.json",
      );
      mergeMcpServersConfig(filePath, serverBlock);
      console.error(`  Written to ${filePath}`);
      console.error(
        "  In Windsurf settings, click refresh to load the new server.",
      );
      break;
    }
    case "6": {
      // Zed — settings.json under `context_servers`, with required source:custom.
      const filePath = zedConfigPath();
      const zedBlock: Record<string, unknown> = {
        source: "custom",
        command: "npx",
        args: ["-y", "scholar-feed-mcp"],
      };
      if (hasKey) zedBlock.env = env;
      mergeKeyedConfig(filePath, "context_servers", zedBlock);
      console.error(`  Written to ${filePath}`);
      console.error("  Restart Zed to activate.");
      break;
    }
    case "7": {
      // Gemini CLI — ~/.gemini/settings.json
      const filePath = join(homedir(), ".gemini", "settings.json");
      mergeMcpServersConfig(filePath, serverBlock);
      console.error(`  Written to ${filePath}`);
      console.error("  Restart the Gemini CLI to activate.");
      break;
    }
    case "8": {
      // LM Studio — ~/.lmstudio/mcp.json (Cursor notation)
      const filePath = join(homedir(), ".lmstudio", "mcp.json");
      mergeMcpServersConfig(filePath, serverBlock);
      console.error(`  Written to ${filePath}`);
      console.error("  In LM Studio, save mcp.json to load the new server.");
      break;
    }
    case "9": {
      // Continue — YAML config; print rather than risk corrupting the file.
      console.error(
        "  Add this to ~/.continue/config.yaml (global) or .continue/config.yaml (workspace):\n",
      );
      console.error(continueYamlSnippet(hasKey));
      if (hasKey) {
        console.error("\n  Replace <your-key> with the key you just entered.");
      }
      break;
    }
    case "10": {
      // JetBrains AI Assistant — configured through the IDE UI.
      console.error(
        "  In your JetBrains IDE: Settings -> Tools -> AI Assistant ->",
      );
      console.error(
        "  Model Context Protocol (MCP) -> Add -> As JSON, then paste:\n",
      );
      console.error(standardJsonSnippet(hasKey));
      if (hasKey) {
        console.error("\n  Replace <your-key> with the key you just entered.");
      }
      break;
    }
    case "11": {
      // Cline / Roo Code — configured through the extension UI.
      console.error(
        "  In Cline or Roo Code: click the MCP Servers icon -> Configure / Edit,",
      );
      console.error("  then paste:\n");
      console.error(standardJsonSnippet(hasKey));
      if (hasKey) {
        console.error("\n  Replace <your-key> with the key you just entered.");
      }
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
  console.error(
    '\nDone! Try asking: "Search for papers on test-time compute scaling"',
  );
}
