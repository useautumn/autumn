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

RUN bun install

# Stage 1: /localtunnel
FROM base AS localtunnel
WORKDIR /app
COPY localtunnel-start.sh ./
CMD ["sh", "localtunnel-start.sh"]

# Stage 2: /vite
FROM base AS vite
COPY shared/ ./shared/
WORKDIR /app/vite
COPY vite/ ./
EXPOSE 3000
CMD ["bun", "dev"]

# Stage 3: /server
FROM base AS server
COPY shared/ ./shared/
COPY server/ ./server/
WORKDIR /app/server
EXPOSE 8080
CMD ["bun", "dev"]

# Stage 4: Workers
FROM base AS workers
COPY shared/ ./shared/
COPY server/ ./server/
WORKDIR /app/server
CMD ["bun", "workers:dev"]