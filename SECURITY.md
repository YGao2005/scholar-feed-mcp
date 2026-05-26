# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- **Preferred:** email **hello@scholarfeed.org** with details and reproduction
  steps.
- You may also use GitHub's
  [private vulnerability reporting](https://github.com/YGao2005/scholar-feed-mcp/security/advisories/new)
  if it is enabled on this repository.

This is a small project maintained on a best-effort basis; expect an initial
response within a few days. Please allow a reasonable window to ship a fix
before any public disclosure.

## Supported versions

Only the latest published `3.x` release receives security fixes.

| Version | Supported |
| ------- | --------- |
| 3.x     | ✅        |
| < 3.0   | ❌        |

## Scope and trust model

This package is a thin client that runs **locally** under your MCP host (Claude
Code, Cursor, Claude Desktop) and talks to the Scholar Feed HTTP API. A few
things are trusted by design:

- **`SF_API_KEY`** is read from the process environment / your MCP client config
  and sent as a `Bearer` token to the Scholar Feed API. Anyone who can read that
  environment or config can read your key — protect it like any other credential.
- **`SF_API_BASE_URL`** is a self-hosting / testing override. It is both the
  request target **and** the recipient of the `Authorization: Bearer` key, so
  pointing it at a host you don't control would send your key there. It is
  intentionally **not** restricted to an allowlist (that would break legitimate
  self-hosting and the test suite). Only set it to an endpoint you trust —
  setting it already implies control of the process environment, which is the
  trust boundary.
- The server logs only to **stderr** and never echoes your key.

Out of scope: issues that require an attacker to already control your machine,
environment variables, or MCP client configuration.
