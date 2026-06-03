# syntax=docker/dockerfile:1

# Shared runtime image for server + workers + cron + mcp.
# Each FlightControl service runs the same image with a different command:
#   server  -> bun start            (cwd /app/server)
#   workers -> bun src/workers.ts   (cwd /app/server)
#   cron    -> bun src/cron.ts      (cwd /app/server)
#   mcp     -> cd /app/apps/mcp-server && bun start
FROM oven/bun:1.3.10 AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.9.14 prune @autumn/server @autumn/mcp-server autumn-js @useautumn/sdk --docker

FROM oven/bun:1.3.10
WORKDIR /app

# Install from the pruned package.json set only, so this layer stays cached
# until a runtime workspace's deps change (not on every source edit).
COPY --from=pruner /app/out/json/ .
RUN mkdir -p scripts && touch scripts/preload-env.ts
RUN bun -e 'const fs = require("fs"); const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); pkg.workspaces.packages = ["server", "shared", "apps/mcp-server", "packages/ksuid", "packages/mcp", "packages/stripe-sync", "packages/autumn-js", "packages/sdk"]; delete pkg.dependencies; delete pkg.devDependencies; delete pkg.scripts; fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));'
RUN --mount=type=cache,target=/root/.bun/install/cache \
	rm -f bun.lock && bun install --ignore-scripts

COPY --from=pruner /app/out/full/ .

ENV NODE_ENV=production
EXPOSE 8080

WORKDIR /app/server
CMD ["bun", "start"]
