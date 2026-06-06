/**
 * Vercel serverless entry for the Scholar Feed remote MCP server.
 *
 * Vercel deploys files under api/ as functions, and @vercel/node serves a
 * default-exported Express app as the request handler (Vercel owns the HTTP
 * server, so there is no app.listen() here). vercel.json rewrites every path to
 * this function, so POST /mcp and the /.well-known/* metadata routes defined in
 * server-http.ts all reach Express.
 *
 * Why this file exists: the package `build` script is tsup, which emits the
 * STDIO bin (build/index.js). Vercel's zero-config was deploying that stdio
 * bundle as the HTTP function -- a stdio server speaks JSON-RPC over stdin and
 * has no HTTP handler, so every request returned FUNCTION_INVOCATION_FAILED.
 * This pins the HTTP entry to the Express app instead. vercel.json also sets a
 * no-op buildCommand so tsup never runs on Vercel and cannot be re-grabbed.
 */
import { createApp } from "../src/server-http.js";

// The remote transport derives EACH request's key from its own Authorization
// header. A process-level SF_API_KEY is a latent cross-tenant leak (client.ts
// falls back to it only if a request's credential context is ever lost), so it
// must never be set on the remote server. Fail loud at cold start over shipping
// that footgun -- mirrors the same guard in src/server.ts.
if (process.env.SF_API_KEY) {
  throw new Error(
    "[api] FATAL: SF_API_KEY must NOT be set in the remote server's " +
      "environment -- each request carries its own key. A process-level key is " +
      "a latent cross-tenant leak. Unset SF_API_KEY and redeploy.",
  );
}

export default createApp({ enableJsonResponse: true });
