/**
 * Shared MCP server identity (the `serverInfo` / `Implementation` returned in the
 * initialize response). Used by BOTH entry points — the stdio package
 * (src/index.ts) and the remote Streamable HTTP server (src/server-http.ts) — so
 * the name, title, website, and logo stay in sync across surfaces.
 *
 * `title` + `icons` are what a host (claude.ai, Claude Desktop, Cursor, ...)
 * renders for the connector. Without them a host shows a placeholder. `icons[].src`
 * MUST be a publicly reachable HTTPS image URL — the host fetches it directly.
 *
 * The default icon is the branded 400x400 PNG committed to this repo, served via
 * GitHub raw (a stable public URL, no deploy needed). Override with SF_MCP_ICON_URL
 * once the asset is hosted on your own domain (e.g. https://www.scholarfeed.org/icon.png).
 */

import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

/** Stable public URL of the branded marketplace icon (overridable via env). */
const DEFAULT_ICON_URL =
  "https://raw.githubusercontent.com/YGao2005/scholar-feed-mcp/main/assets/icon-marketplace.png";

/** The icon URL a host fetches for the connector logo. */
export function iconUrl(): string {
  return process.env.SF_MCP_ICON_URL ?? DEFAULT_ICON_URL;
}

/**
 * Build the server identity for a given package version. Taken as a parameter
 * (rather than read here) so each entry point keeps its single createRequire
 * read of package.json.
 */
export function buildServerInfo(version: string): Implementation {
  return {
    name: "scholar-feed",
    title: "Scholar Feed",
    version,
    websiteUrl: "https://www.scholarfeed.org",
    description:
      "Search 600,000+ CS/AI/ML papers with LLM analysis, a citation graph, and full-text extraction.",
    icons: [
      {
        src: iconUrl(),
        mimeType: "image/png",
        sizes: ["400x400"],
      },
    ],
  };
}
