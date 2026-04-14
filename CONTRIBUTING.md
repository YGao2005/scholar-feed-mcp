# Contributing to Scholar Feed MCP

Thanks for your interest in contributing! This guide covers the basics.

## Setup

```bash
git clone https://github.com/YGao2005/scholar-feed-mcp.git
cd scholar-feed-mcp
npm install
npm run build
```

You'll need an API key from [scholarfeed.org/settings](https://www.scholarfeed.org/settings) to test against the live API.

## Development

```bash
npm run dev        # Watch mode — rebuilds on file changes
npm run typecheck  # Type check without emitting
npm test           # Run tests
```

### Project Structure

```
src/
  index.ts          # Entry point — server setup + init subcommand
  client.ts         # API client wrapper (auth, error handling)
  init.ts           # Interactive setup wizard
  tools/
    index.ts        # Tool registration barrel
    search.ts       # One file per tool
    ...
```

### Adding a New Tool

1. Create `src/tools/your_tool.ts` following the pattern of existing tools
2. Import and register it in `src/tools/index.ts`
3. Add it to the tool table in `README.md`
4. Add a test case in `src/__tests__/tools.test.ts`

Each tool file exports a `register(server: McpServer)` function that calls `server.registerTool()` with a name, Zod input schema, and handler.

### Code Style

- **Strict TypeScript** — `strict: true`, no `any` unless unavoidable
- **All logging to stderr** — `console.error()` only. `console.log()` corrupts the JSON-RPC stdio transport.
- **ESM imports** — always include `.js` extension in relative imports
- **Zod schemas** — all tool inputs validated with Zod

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes with clear commit messages
3. Run `npm run typecheck` and `npm test` before pushing
4. Open a PR with a description of what changed and why

## Reporting Issues

Open an issue on GitHub. For bugs, include:
- Your MCP client (Claude Code, Cursor, Claude Desktop)
- Node.js version (`node --version`)
- The tool call that failed and the error message
