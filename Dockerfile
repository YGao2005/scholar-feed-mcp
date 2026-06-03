# syntax=docker/dockerfile:1
#
# Container image for the Scholar Feed stdio MCP server.
#
# The server speaks JSON-RPC over stdin/stdout, so this image is meant to be run
# attached to a stdio transport (Glama introspection, the Docker MCP Catalog, or
# `docker run -i`), not as a long-lived network service.
#
#   docker build -t scholar-feed-mcp .
#   docker run --rm -i scholar-feed-mcp                 # anonymous (100 calls/day)
#   docker run --rm -i -e SF_API_KEY=sf_... scholar-feed-mcp   # keyed (1,000/day)
#
# SF_API_KEY is optional: the full tool surface registers and answers tools/list
# introspection without a key (the key is only read per request, at call time).

# Build stage: install all deps and compile src/ to build/.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage: production deps plus the compiled output only.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/build ./build

ENTRYPOINT ["node", "build/index.js"]
