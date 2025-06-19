# Multi-stage Dockerfile for Autumn development
FROM node:18-alpine AS base

WORKDIR /app

RUN npm install -g pnpm

COPY package*.json ./
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY vite/package*.json ./vite/

RUN pnpm install
RUN npm install -g nodemon tsx

# Stage 1: /localtunnel
FROM base AS localtunnel
WORKDIR /app
COPY localtunnel-start.sh ./
CMD ["sh", "localtunnel-start.sh"]

#  Stage 2: /shared
FROM base AS shared
COPY shared/ ./shared/
WORKDIR /app/shared
RUN pnpm run build
CMD ["pnpm", "run", "dev"]

# Stage 3: /vite
FROM base AS vite
WORKDIR /app/vite
COPY vite/ ./
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# Stage 4: /server
FROM base AS server
COPY server/ ./server/
WORKDIR /app/server
EXPOSE 8080
CMD ["pnpm", "run", "dev"]

# Stage 5: Workers
FROM base AS workers
COPY server/ ./server/
WORKDIR /app/server
CMD ["pnpm", "run", "workers"]