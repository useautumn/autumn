# =============================================================================
# Autumn Sandbox — dev mode, fully self-contained (except Postgres + Valkey
# which are sidecars in docker-compose.sandbox.yml)
# =============================================================================
FROM oven/bun:latest

WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true

# ── Install dependencies ──────────────────────────────────────────────────────
COPY package.json bun.lock ./
COPY shared/package.json         ./shared/
COPY server/package.json         ./server/
COPY vite/package.json           ./vite/
COPY scripts/package.json        ./scripts/
COPY apps/checkout/package.json  ./apps/checkout/
COPY apps/docs/package.json      ./apps/docs/
COPY apps/sdk-test/package.json  ./apps/sdk-test/
COPY packages/sdk/package.json           ./packages/sdk/
COPY packages/autumn-js/package.json     ./packages/autumn-js/
COPY packages/openapi/package.json       ./packages/openapi/

RUN bun install --ignore-scripts

# ── Copy full source ──────────────────────────────────────────────────────────
COPY . .

# ── Generate fresh schema SQL into /tmp/drizzle-gen ──────────────────────────
# Uses the container-only config (docker/sandbox-drizzle.config.ts) which
# outputs to /tmp/drizzle-gen — your local shared/drizzle/ is never touched.
RUN cp /app/docker/sandbox-drizzle.config.ts /app/shared/sandbox-drizzle.config.ts && \
    cd /app/shared && NODE_OPTIONS="--import tsx" \
      bun /app/shared/node_modules/.bin/drizzle-kit generate \
      --config /app/shared/sandbox-drizzle.config.ts \
      --name sandbox_init

COPY docker/sandbox-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080 3000

ENV NODE_ENV=development
ENV MOCK_MODE=true

ENTRYPOINT ["/entrypoint.sh"]
