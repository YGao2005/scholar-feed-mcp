/**
 * Scholar Feed MCP — Vercel deployment entrypoint.
 *
 * A thin wrapper over the Express app in server-http.ts (createApp). It lives at
 * a filename Vercel auto-detects as a Node/Express server (`src/server.{ts,…}`):
 * Vercel captures the app.listen() call below and routes EVERY incoming request
 * to the app, preserving the original req.url so the app's own `/mcp` +
 * `/.well-known/*` routing matches (a catch-all rewrite would rewrite req.url to
 * `/api` and break that). The request reaches Express as a raw IncomingMessage,
 * so express.json() owns body parsing with no double-parse. Locally,
 * `tsx src/server.ts` runs the same server.
 *
 * Why a SEPARATE entry from server-http.ts's run-directly guard: that guard is
 * keyed on `import.meta.url === file://${process.argv[1]}`, which is FALSE under
 * Vercel's captured-server runtime (the file is instrumented, not invoked as the
 * process main module). So the SF_API_KEY leak-check, the host-allowlist warning,
 * and listen() must all run UNCONDITIONALLY here, not behind that guard.
 *
 * Why express is imported HERE and the app is mounted: Vercel's Node/Express
 * detection identifies a server entrypoint by scanning the entrypoint file for
 * an `express` import. The configured app is built by createApp() in
 * server-http.ts, so we import express in this file and mount the configured app
 * under a host app (at "/", so the mounted app still sees the original req.url —
 * /mcp, /.well-known/* — and runs its own CORS, DNS-rebinding guards, and
 * express.json() unchanged).
 *
 * JSON-response mode is on: serverless has no long-lived res.on("close")
 * lifecycle, and this stateless server has no server->client push, so buffering
 * each request's JSON-RPC replies into one application/json response is lossless
 * and avoids SSE-teardown truncation (the same choice src/worker.ts makes).
 *
 * CRITICAL: All logging uses console.error() — never console.log().
 */

import express from "express";
import { createApp } from "./server-http.js";
import { isHostAllowlistEmpty } from "./http/resolve-creds.js";

// The remote transport derives EACH request's key from its own Authorization
// header. A process-level SF_API_KEY is a latent cross-tenant leak (client.ts
// falls back to it only if a request's creds context is ever lost), so it must
// never be set on the remote server. Fail loud over shipping that footgun — on
// Vercel a throw at module load surfaces as a clear function error rather than
// silently serving every tenant with one key.
if (process.env.SF_API_KEY) {
  throw new Error(
    "[server] FATAL: SF_API_KEY must NOT be set in the remote server's " +
      "environment — each request carries its own key. A process-level key is a " +
      "latent cross-tenant leak. Unset SF_API_KEY and redeploy.",
  );
}

if (isHostAllowlistEmpty()) {
  console.error(
    "[server] WARNING: SF_MCP_ALLOWED_HOSTS is unset — only loopback Host " +
      "headers are accepted, so a public deploy will 403 every request. Set it " +
      "to the public host this server answers on (e.g. mcp.scholarfeed.org).",
  );
}

const app = express();
app.use(createApp({ enableJsonResponse: true }));

// Vercel captures this listen() and routes requests through its own internal
// port; the number here is only used for local `tsx src/server.ts`. Exporting
// the app as default is the belt-and-suspenders half of Vercel's detection
// (a default export OR a port listener satisfies it).
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.error(`Scholar Feed MCP (remote/HTTP) listening on :${port}/mcp`);
});

export default app;
