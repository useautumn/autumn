# ---- Base dependencies ----
FROM node:18-alpine AS base
WORKDIR /app
RUN npm install -g pnpm serve typescript tsc tsc-alias tsx

COPY package*.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY vite/package*.json ./vite/

RUN pnpm install

FROM base AS localtunnel
WORKDIR /app
COPY localtunnel-start.sh ./
CMD ["sh", "localtunnel-start.sh"]

# # ---- Build frontend (vite) ----
FROM base AS vite-build
COPY . .
WORKDIR /app
RUN pnpm run vite:build

# ---- Build backend (server) ----
FROM base AS server-build
COPY . .
WORKDIR /app
RUN pnpm run server:build

# ---- Production frontend image ----
FROM vite-build AS vite-prod
EXPOSE 3000
WORKDIR /app
CMD ["pnpm", "run", "vite:start"]

FROM server-build AS server-prod
EXPOSE 8080
WORKDIR /app
CMD ["pnpm", "run", "server:start"]

FROM server-build AS workers-prod
EXPOSE 8080
WORKDIR /app
CMD ["pnpm", "run", "server:workers"]

