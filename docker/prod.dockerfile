# ---- Base dependencies ----
FROM oven/bun:latest AS base
WORKDIR /app
RUN bun install -g serve typescript tsc tsc-alias tsx

COPY package.json bun.lock ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY vite/package*.json ./vite/

RUN bun install

FROM base AS localtunnel
WORKDIR /app
COPY localtunnel-start.sh ./
CMD ["sh", "localtunnel-start.sh"]

# ---- Build shared package ----
FROM base AS shared-build
COPY shared/ ./shared/
WORKDIR /app/shared
RUN bun run build

# ---- Build frontend (vite) ----
FROM base AS vite-build
COPY --from=shared-build /app/shared/dist ./shared/dist
COPY . .
WORKDIR /app
RUN bun run build

# ---- Build backend (server) ----
FROM base AS server-build
COPY --from=shared-build /app/shared/dist ./shared/dist
COPY . .
WORKDIR /app
# RUN bun run server:build:bun

# ---- Production frontend image ----
FROM vite-build AS vite-prod
EXPOSE 3000
WORKDIR /app
CMD ["bun", "start"]

FROM server-build AS server-prod
EXPOSE 8080
WORKDIR /app/server
CMD ["bun", "start"]

FROM server-build AS workers-prod
EXPOSE 8080
WORKDIR /app/server
CMD ["bun", "workers"]
