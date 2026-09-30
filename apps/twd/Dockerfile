# twd needs the monorepo: it imports scripts/tw and resolves server/tests at each run's sha.
FROM oven/bun:1.3.14

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY . .
RUN bun install --ignore-scripts && cd apps/twd && bun run web:build

ENV NODE_ENV=production \
	TWD_CACHE_DIR=/data/twd-cache \
	TW_GIT_URL=https://github.com/useautumn/autumn

WORKDIR /repo/apps/twd
CMD ["bun", "src/main.ts"]
