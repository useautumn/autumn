# Multi-stage Dockerfile for Autumn development
FROM node:18-alpine AS base

WORKDIR /app

RUN npm install -g pnpm

COPY package*.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY vite/ ./vite/
RUN pnpm install
RUN npm install -g nodemon tsx

# Stage 2: /shared
FROM base AS shared
WORKDIR /app/shared
CMD ["pnpm", "run", "dev"]

# Stage 3: /vite
FROM base AS vite
WORKDIR /app/vite
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# Stage 4: /server
FROM base AS server
WORKDIR /app/server
EXPOSE 8080
CMD ["pnpm", "run", "dev"]

# Stage 5: Workers
FROM base AS workers
WORKDIR /app/server
CMD ["pnpm", "run", "workers"]