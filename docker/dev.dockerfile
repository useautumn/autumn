# Multi-stage Dockerfile for Autumn development
FROM oven/bun:latest AS base

WORKDIR /app

# Skip Puppeteer Chromium download to speed up install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json ./
COPY bun.lockb ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY vite/package*.json ./vite/

RUN bun install

# Stage 1: /localtunnel
FROM base AS localtunnel
WORKDIR /app
COPY localtunnel-start.sh ./
CMD ["sh", "localtunnel-start.sh"]

#  Stage 2: /shared
FROM base AS shared
COPY shared/ ./shared/
WORKDIR /app/shared
RUN bun run build
CMD ["bun", "run", "dev:bun"]

# Stage 3: /vite
FROM base AS vite
COPY --from=shared /app/shared/dist ./shared/dist
WORKDIR /app/vite
COPY vite/ ./
EXPOSE 3000
CMD ["bun", "run", "dev"]

# Stage 4: /server
FROM base AS server
COPY --from=shared /app/shared/dist ./shared/dist
COPY server/ ./server/
WORKDIR /app/server
EXPOSE 8080
CMD ["bun", "run", "dev:bun"]

# Stage 5: Workers
FROM base AS workers
COPY --from=shared /app/shared/dist ./shared/dist
COPY server/ ./server/
WORKDIR /app/server
CMD ["bun", "run", "workers:bun"]