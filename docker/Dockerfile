# syntax=docker/dockerfile:1

# Shared runtime image for Autumn's server, workers, and scheduled services.
# Each FlightControl service runs the same image with a different command:
#   server          -> bun start           (cwd /app/server)
#   workers         -> bun workers         (cwd /app/server)
#   cron            -> bun cron            (cwd /app/server)
#   balance-workers -> bun balance-workers (cwd /app/server)
#   herald          -> bun herald          (cwd /app/server)
#   leaf            -> bun leaf            (cwd /app/server; serves chat + MCP routes)
#   ducklake        -> bun src/ducklake.ts (cwd /app/server; FC job-scheduler one-shot)
ARG BUN_VERSION=1.4.2

# Collect every workspace manifest listed in the root package.json. Only this
# stage's output feeds deps, so install stays cached until a manifest changes.
FROM oven/bun:${BUN_VERSION} AS manifests
COPY . /src
WORKDIR /
RUN bun -e 'const { cpSync } = require("node:fs"); \
	for (const w of require("/src/package.json").workspaces.packages) \
		cpSync(`/src/${w}/package.json`, `/out/${w}/package.json`);'

FROM oven/bun:${BUN_VERSION} AS deps
ARG BUN_VERSION
WORKDIR /app

# Install against the real bun.lock (not a turbo-pruned one) so zod v3 stays
# hoisted for the server while autumn-js keeps its nested zod v4.
COPY package.json bun.lock bunfig.toml ./
# patchedDependencies in package.json are applied during install, so the
# patch files must be present before it runs.
COPY patches/ patches/
COPY --from=manifests /out/ ./

# bunfig.toml preloads ./scripts/preload-env.ts on every bun run; stub it so the
# install step doesn't fail before the real source is copied.
RUN mkdir -p scripts && touch scripts/preload-env.ts

# Install the full workspace (runtime source imports cross package boundaries).
# --frozen-lockfile pins bun.lock exactly; --ignore-scripts blocks postinstall hooks.
# Cache keyed per Bun version so two runtimes never share one install cache.
RUN --mount=type=cache,id=bun-install-${BUN_VERSION},target=/root/.bun/install/cache \
	bun install --ignore-scripts --frozen-lockfile

FROM oven/bun:${BUN_VERSION}
WORKDIR /app
ENV NODE_ENV=production

# oven/bun ships an empty /etc/ssl/certs; native TLS (DuckDB's MotherDuck
# extension gRPC) needs the system CA bundle, unlike Bun's bundled JS store.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# node_modules (+ manifests) from the cached deps layer, then the source on top.
# node_modules is .dockerignore'd, so COPY . . never clobbers the install.
COPY --from=deps /app ./
COPY . .

EXPOSE 8080

WORKDIR /app/server
CMD ["bun", "start"]
