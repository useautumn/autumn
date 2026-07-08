# syntax=docker/dockerfile:1

# Shared runtime image for server + workers + cron + leaf.
# Each FlightControl service runs the same image with a different command:
#   server  -> bun start            (cwd /app/server)
#   workers -> bun src/workers.ts   (cwd /app/server)
#   cron    -> bun src/cron.ts      (cwd /app/server)
#   leaf    -> bun leaf             (cwd /app/server; serves chat + MCP routes)
FROM oven/bun:1.3.10 AS deps
WORKDIR /app

# Copy the committed lockfile + every workspace manifest. Installing against the
# real bun.lock (not a turbo-pruned one) keeps resolution byte-for-byte identical
# to local/CI: zod v3 stays hoisted for the server, autumn-js keeps its nested
# zod v4. --frozen-lockfile needs every workspace manifest present, so list them
# all (add a line here when a workspace is added). Source is copied later, so this
# layer caches until a package.json or the lockfile changes.
COPY package.json bun.lock bunfig.toml ./
COPY server/package.json server/
COPY shared/package.json shared/
COPY vite/package.json vite/
COPY scripts/package.json scripts/
COPY apps/leaf/package.json apps/leaf/
COPY apps/checkout/package.json apps/checkout/
COPY apps/docs/package.json apps/docs/
COPY apps/sdk-test/package.json apps/sdk-test/
COPY apps/testbench/package.json apps/testbench/
COPY apps/website/package.json apps/website/
COPY packages/agent-docs/package.json packages/agent-docs/
COPY packages/atmn/package.json packages/atmn/
COPY packages/atmn-tests/package.json packages/atmn-tests/
COPY packages/auth/package.json packages/auth/
COPY packages/autumn-js/package.json packages/autumn-js/
COPY packages/gateway/package.json packages/gateway/
COPY packages/ksuid/package.json packages/ksuid/
COPY packages/logging/package.json packages/logging/
COPY packages/mcp/package.json packages/mcp/
COPY packages/openapi/package.json packages/openapi/
COPY packages/render/package.json packages/render/
COPY packages/sdk/package.json packages/sdk/
COPY packages/stripe-sync/package.json packages/stripe-sync/
COPY packages/ui/package.json packages/ui/

# bunfig.toml preloads ./scripts/preload-env.ts on every bun run; stub it so the
# install step doesn't fail before the real source is copied.
RUN mkdir -p scripts && touch scripts/preload-env.ts

# Install the full workspace (runtime source imports cross package boundaries).
# --frozen-lockfile pins bun.lock exactly; --ignore-scripts blocks postinstall hooks.
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --ignore-scripts --frozen-lockfile

FROM oven/bun:1.3.10
WORKDIR /app
ENV NODE_ENV=production

# node_modules (+ manifests) from the cached deps layer, then the source on top.
# node_modules is .dockerignore'd, so COPY . . never clobbers the install.
COPY --from=deps /app ./
COPY . .

EXPOSE 8080

WORKDIR /app/server
CMD ["bun", "start"]
