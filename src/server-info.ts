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
 * The brand favicon, hosted on the brand domain. The remote MCP origin
 * (mcp.scholarfeed.org) is a bare API surface with no favicon, so a host that
 * renders the connector icon from the ORIGIN's favicon — claude.ai does this —
 * would otherwise fall back to the hosting platform's logo (e.g. Vercel's). The
 * remote entry points redirect GET /favicon.ico here so the brand logo shows.
 */
export const BRAND_FAVICON_URL = "https://www.scholarfeed.org/favicon.ico";

/**
 * A minimal branded landing page for GET / on the remote MCP origin. Humans who
 * open the URL in a browser get a pointer to the docs instead of a bare 404, and
 * a host that parses the root HTML gets a `<link rel="icon">` brand signal (a
 * second path to the right connector logo alongside the favicon redirect).
 */
export function landingPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scholar Feed MCP</title>
<link rel="icon" href="${BRAND_FAVICON_URL}">
<link rel="icon" type="image/png" href="${iconUrl()}">
<meta property="og:title" content="Scholar Feed MCP">
<meta property="og:image" content="${iconUrl()}">
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.25rem;line-height:1.55;color:#0f172a}a{color:#2563eb}code{background:#f1f5f9;padding:.12rem .4rem;border-radius:.25rem;font-size:.95em}</style>
</head>
<body>
<h1>Scholar Feed MCP</h1>
<p>This is the Model Context Protocol endpoint for <a href="https://www.scholarfeed.org">Scholar Feed</a> — search 600,000+ CS/AI/ML papers with LLM analysis, a citation graph, and full-text extraction.</p>
<p>Point an MCP client at <code>POST /mcp</code> on this host. Docs &amp; free API keys: <a href="https://www.scholarfeed.org/developers">scholarfeed.org/developers</a>.</p>
</body>
</html>
`;
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
