/**
 * Interactive setup wizard for Scholar Feed MCP.
 *
 * Usage: npx scholar-feed-mcp@latest init
 *
 * Prompts for an API key (optional) and an MCP client, then configures the
 * appropriate config file or prints the snippet to paste. No external
 * dependencies — uses Node.js built-ins only.
 *
 * Every client launches the same stdio server (`npx -y scholar-feed-mcp@latest`); they
 * differ only in config-file location and the wrapper key:
 *   - Most clients use `mcpServers` (Cursor, Claude Desktop, Windsurf, Gemini
 *     CLI, LM Studio) — handled by mergeMcpServersConfig.
 *   - VS Code uses a `servers` key with an explicit `type: "stdio"`.
 *   - Zed uses a `context_servers` key with a required `source: "custom"`.
 *   - Codex is TOML, not JSON — appended as a `[mcp_servers.scholar-feed]` table.
 *   - Continue (YAML), JetBrains (UI), and Cline/Roo (UI) can't be safely
 *     written for the user, so we print the snippet to paste instead.
 *
 * Keep this list in sync with README.md and the website /developers picker
 * (frontend/components/dev/McpInstall.tsx).
 */

import { createInterface } from "readline";
import { execFileSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  renameSync,
  rmSync,
} from "fs";
import { join, dirname } from "path";
import { homedir, platform } from "os";

/**
 * The readline interface, created on first use rather than at module scope.
 *
 * Attaching to process.stdin eagerly resumes the stream and keeps the event loop
 * alive, which hangs any test that merely imports this module to exercise a
 * config writer. Lazy creation keeps `init.ts` importable.
 */
let rl: ReturnType<typeof createInterface> | undefined;

function prompt(): ReturnType<typeof createInterface> {
  rl ??= createInterface({ input: process.stdin, output: process.stderr });
  return rl;
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    prompt().question(question, (answer) => resolve(answer.trim()));
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
          `  Connected! Running in anonymous mode (200 calls/month).`,
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
      "args": ["-y", "scholar-feed-mcp@latest"]${envLine}
    }
  }
}`;
}

/**
 * Codex's config directory. `CODEX_HOME` overrides `~/.codex`, and Codex itself
 * honours it — verified against codex-cli 0.146.1, which read a config from
 * `$CODEX_HOME/config.toml` and listed the server. Writing to `~/.codex`
 * unconditionally meant the wizard reported success while Codex never saw the
 * server at all.
 */
export function codexConfigPath(): string {
  const home = process.env.CODEX_HOME;
  return home
    ? join(home, "config.toml")
    : join(homedir(), ".codex", "config.toml");
}

/**
 * Is this safe to embed in a TOML basic string?
 *
 * Only the prefix was validated before, so a mistyped paste like `sf_bad"key`
 * was written straight into `SF_API_KEY = "..."` and made the user's whole Codex
 * config unparseable. Real keys are `sf_` + hex, so restricting the charset costs
 * nothing and removes the escaping question entirely.
 */
function isSafeApiKey(apiKey: string): boolean {
  return /^sf_[A-Za-z0-9_-]+$/.test(apiKey);
}

/**
 * Codex's `[mcp_servers.<name>]` TOML table.
 *
 * `env` is written as an inline table. Codex's published example uses a
 * `[mcp_servers.<name>.env]` sub-table instead, but both are the same construct in
 * TOML and codex-cli 0.146.1 accepts the inline form (verified: `codex mcp list`
 * showed SF_API_KEY set from an inline-table config). Inline keeps the whole server
 * definition in one appendable block, which the append strategy below depends on.
 */
function codexTomlBlock(apiKey: string): string {
  const envLine = apiKey ? `\nenv = { SF_API_KEY = "${apiKey}" }` : "";
  return `[mcp_servers.scholar-feed]
command = "npx"
args = ["-y", "scholar-feed-mcp@latest"]${envLine}`;
}

/**
 * The PRINTABLE Codex block — placeholder only, never a real key.
 *
 * Deliberately does NOT delegate to codexTomlBlock, even though the template is
 * the same. codexTomlBlock is the function that embeds the real key (for the file
 * we write at 0600); sharing it with a path that reaches `console.error` means the
 * only thing standing between a secret and stderr is which argument a caller
 * happened to pass. CodeQL says so too: its summary of codexTomlBlock is
 * context-insensitive, so `console.error(shared(placeholder))` still reported
 * js/clear-text-logging because a DIFFERENT caller passes apiKey.
 *
 * So the two paths share no code. This one has no parameter a key could enter
 * through, which makes the invariant structural rather than a matter of reviewer
 * attention. The duplicated template is pinned by a test that fails if the two
 * blocks drift apart; that is the cost of the separation and it is worth paying,
 * because stderr ends up in scrollback, screen-shares and bug reports.
 */
export function codexTomlSnippet(hasKey: boolean): string {
  const envLine = hasKey ? `\nenv = { SF_API_KEY = "<your-key>" }` : "";
  return `[mcp_servers.scholar-feed]
command = "npx"
args = ["-y", "scholar-feed-mcp@latest"]${envLine}`;
}

/**
 * Every way a Codex config can already define `mcp_servers.scholar-feed`.
 *
 * The table-header form is not the only one, and appending a second definition in
 * ANY of these cases is a TOML duplicate-key error that takes down the user's other
 * servers along with ours:
 *   - `[mcp_servers.scholar-feed]`      / `[mcp_servers."scholar-feed"]`
 *   - `["mcp_servers"."scholar-feed"]`  (fully quoted)
 *   - `mcp_servers.scholar-feed.command = "..."`  (dotted key, no header)
 *   - `mcp_servers = { scholar-feed = ... }`      (inline table at the root)
 */
const CODEX_TABLE_HEADER =
  /^[ \t]*\[[ \t]*"?mcp_servers"?[ \t]*\.[ \t]*"?scholar-feed"?[ \t]*\]/m;
const CODEX_DOTTED_KEY =
  /^[ \t]*"?mcp_servers"?[ \t]*\.[ \t]*"?scholar-feed"?[ \t]*\./m;
const CODEX_INLINE_ROOT = /^[ \t]*"?mcp_servers"?[ \t]*=/m;

/**
 * Add the Codex server table to Codex's config.toml, appending rather than
 * rewriting.
 *
 * We APPEND instead of parse-merge on purpose: bundling a TOML parser would break
 * the `dependencies: {}` rule (CLAUDE.md), and hand-rolling one to rewrite a
 * user's whole editor config is a far worse failure mode than declining to write.
 * Opening a new `[table]` header always closes the previous one, so appending is
 * valid TOML for any input we accept.
 *
 * Because a duplicate definition breaks the ENTIRE file (Codex refuses to parse it,
 * so every other server the user configured stops working), this fails SAFE: if any
 * form of an existing definition is detected — or anything we cannot reason about,
 * like a `mcp_servers = {...}` root — we write nothing and return 'manual' so the
 * caller prints the snippet for the user to place by hand. Refusing to write is a
 * mild inconvenience; corrupting a config is not.
 *
 * The write is atomic (temp file + rename) because the target holds the user's whole
 * Codex configuration: a crash midway through a plain truncating write would destroy
 * it. A newly created file gets mode 0600 — it can contain an API key, and Node's
 * default under a 022 umask would be world-readable 0644. An existing file keeps its
 * own mode, since rename preserves the temp file's; we set it explicitly to match.
 *
 * @returns 'written'         — the table was appended
 *          'already-present' — a definition already exists; nothing changed
 *          'manual'          — cannot append safely; caller must print the snippet
 */
export function appendCodexConfig(
  filePath: string,
  apiKey: string,
): "written" | "already-present" | "manual" {
  if (apiKey && !isSafeApiKey(apiKey)) return "manual";

  let existing = "";
  let existingMode: number | undefined;
  try {
    existing = readFileSync(filePath, "utf-8");
    existingMode = statSync(filePath).mode & 0o777;
  } catch {
    // Missing — we create it below.
  }

  if (CODEX_TABLE_HEADER.test(existing) || CODEX_DOTTED_KEY.test(existing)) {
    return "already-present";
  }
  // A root-level `mcp_servers = {...}` inline table may or may not contain our
  // key, and appending a header for a table already defined inline is a duplicate
  // either way. Hand it to the user rather than guess.
  if (CODEX_INLINE_ROOT.test(existing)) return "manual";

  const dir = dirname(filePath);
  if (dir) mkdirSync(dir, { recursive: true });
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  const next = `${existing}${separator}\n${codexTomlBlock(apiKey)}\n`;

  // 0600 on create: this file can hold an API key. Preserve the mode of a file the
  // user already had — they may have loosened or tightened it deliberately.
  const mode = existingMode ?? 0o600;
  const tmp = `${filePath}.scholar-feed-${process.pid}.tmp`;
  try {
    writeFileSync(tmp, next, { mode });
    renameSync(tmp, filePath);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // best effort — the rename already failed, nothing more to do
    }
    throw e;
  }
  return "written";
}

function continueYamlSnippet(hasKey: boolean): string {
  const envBlock = hasKey ? `\n    env:\n      SF_API_KEY: <your-key>` : "";
  return `mcpServers:
  - name: scholar-feed
    type: stdio
    command: npx
    args:
      - "-y"
      - scholar-feed-mcp@latest${envBlock}`;
}

export async function runInit(): Promise<void> {
  console.error("Scholar Feed MCP — Setup Wizard\n");

  // Step 1: API key (optional)
  printStep(1, 3, "Enter your API key (optional — press Enter to skip)");
  console.error("  Get a free key at: https://www.scholarfeed.org/settings");
  console.error(
    "  Without a key, you get 200 calls/month. With a key, 500/month per account.",
  );
  const apiKey = await ask("  API key (sf_...): ");

  if (apiKey && !apiKey.startsWith("sf_")) {
    console.error(
      "  Error: API key must start with 'sf_'. Get one at https://www.scholarfeed.org/settings",
    );
    prompt().close();
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
  console.error("   9) OpenAI Codex");
  console.error("  Print snippet to paste:");
  console.error("  10) Continue");
  console.error("  11) JetBrains / PyCharm");
  console.error("  12) Cline / Roo Code");
  const choice = await ask("  Choice (1-12): ");

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
    args: ["-y", "scholar-feed-mcp@latest"],
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
        "scholar-feed-mcp@latest",
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
          `  claude mcp add scholar-feed${keyHint} -- npx -y scholar-feed-mcp@latest`,
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
        args: ["-y", "scholar-feed-mcp@latest"],
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
        args: ["-y", "scholar-feed-mcp@latest"],
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
      // OpenAI Codex — config.toml, shared by the Codex CLI and the IDE extension.
      // TOML, not JSON: pasting any of the other snippets here fails. Honours
      // CODEX_HOME, which Codex itself reads.
      const filePath = codexConfigPath();
      const outcome = appendCodexConfig(filePath, apiKey);
      if (outcome === "already-present") {
        console.error(
          `  ${filePath} already defines mcp_servers.scholar-feed — left unchanged.`,
        );
        console.error(
          "  Edit it by hand if you need to update the key (a duplicate definition",
        );
        console.error("  would make Codex reject the whole file).");
      } else if (outcome === "manual") {
        // Declined to write: we could not guarantee a safe append. Print instead —
        // a config we cannot reason about is the user's to edit, not ours.
        console.error(
          `  Could not safely edit ${filePath}, so nothing was changed.`,
        );
        console.error("  Add this to it yourself:\n");
        console.error(codexTomlSnippet(hasKey));
        console.error(
          "\n  (Either it already sets mcp_servers inline, or the key you entered has",
        );
        console.error(
          "  characters that are not valid unquoted in TOML — check it and retry.)",
        );
      } else {
        console.error(`  Appended to ${filePath}`);
        console.error("  Restart Codex, then ask it to search for papers.");
      }
      if (platform() === "win32") {
        console.error(
          '  On Windows, if Codex cannot launch the server, change command to "cmd"',
        );
        console.error(
          '  and args to ["/c", "npx", "-y", "scholar-feed-mcp@latest"].',
        );
      }
      break;
    }
    case "10": {
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
    case "11": {
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
    case "12": {
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
      console.error(
        "  Invalid choice. Run 'npx scholar-feed-mcp@latest init' again.",
      );
      prompt().close();
      process.exit(1);
    }
  }

  // Verify connection
  console.error("\n  Verifying connection...");
  await verifyKey(apiKey);

  prompt().close();
  console.error(
    '\nDone! Try asking: "Search for papers on test-time compute scaling"',
  );
}
