# syntax=docker/dockerfile:1
#
# Container image for the Scholar Feed stdio MCP server.
#
# The server speaks JSON-RPC over stdin/stdout, so this image is meant to be run
# attached to a stdio transport (the Docker MCP Catalog, Glama introspection, or
# `docker run -i`), not as a long-lived network service.
#
#   docker build -t scholar-feed-mcp .
#   docker run --rm -i scholar-feed-mcp                          # anonymous (100 calls/day)
#   docker run --rm -i -e SF_API_KEY=sf_... scholar-feed-mcp     # keyed (1,000/day)
#   docker run --rm scholar-feed-mcp --version                   # prints the version and exits
#
# SF_API_KEY is optional: the full tool surface registers and answers tools/list
# introspection without a key (the key is only read per request, at call time).

# --- Build stage: install all deps and compile src/ -> build/. ----------------
FROM node:22-slim AS build
WORKDIR /app

# Install deps first so the layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Compile TypeScript (tsup) to build/index.js.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: production deps plus the compiled output only. ------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# package.json is required at runtime: the entrypoint reads its version via
# createRequire("../package.json") (the `--version` flag and server identity).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/build ./build

# Run as a non-root user. The node:* images ship an unprivileged `node` user.
USER node

ENTRYPOINT ["node", "build/index.js"]
