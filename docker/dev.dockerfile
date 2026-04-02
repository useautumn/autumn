# Multi-stage Dockerfile for Autumn development
FROM oven/bun:latest AS base

WORKDIR /app

# Skip Puppeteer Chromium download to speed up install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json ./
COPY bun.lock ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY vite/package*.json ./vite/
COPY scripts/package*.json ./scripts/
COPY apps/checkout/package*.json ./apps/checkout/
COPY apps/docs/package*.json ./apps/docs/
COPY apps/sdk-test/package*.json ./apps/sdk-test/
COPY packages/atmn/package*.json ./packages/atmn/
COPY packages/sdk/package*.json ./packages/sdk/
COPY packages/autumn-js/package*.json ./packages/autumn-js/
COPY packages/openapi/package*.json ./packages/openapi/
COPY packages/ksuid/package*.json ./packages/ksuid/

RUN bun install

# Stage 1: /shared
FROM base AS shared
COPY shared/ ./shared/
COPY packages/ ./packages/
WORKDIR /app/shared
CMD ["bun", "run", "--watch", "index.ts"]

# Stage 2: /localtunnel
FROM base AS localtunnel
WORKDIR /app
COPY localtunnel-start.sh ./
CMD ["sh", "localtunnel-start.sh"]

# Stage 3: /vite
FROM base AS vite
COPY shared/ ./shared/
COPY packages/ ./packages/
WORKDIR /app/vite
COPY vite/ ./
EXPOSE 3000
CMD ["bun", "dev"]

# Stage 4: /server
FROM base AS server
COPY shared/ ./shared/
COPY packages/ ./packages/
COPY scripts/ ./scripts/
COPY server/ ./server/
WORKDIR /app/server
EXPOSE 8080
CMD ["bun", "dev"]

# Stage 5: Workers
FROM base AS workers
COPY shared/ ./shared/
COPY packages/ ./packages/
COPY scripts/ ./scripts/
COPY server/ ./server/
WORKDIR /app/server
CMD ["bun", "workers:dev"]