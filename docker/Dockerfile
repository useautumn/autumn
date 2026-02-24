FROM oven/bun:1.3.2
WORKDIR /app

# Copy root package files
COPY package.json .
COPY bun.lock .

# Copy workspace package.json files
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
COPY vite/package.json ./vite/package.json
COPY scripts/package.json ./scripts/package.json
COPY apps/checkout/package.json ./apps/checkout/package.json
COPY packages/autumn-js/package.json ./packages/autumn-js/package.json
COPY packages/openapi/package.json ./packages/openapi/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY apps/sdk-test/package.json ./apps/sdk-test/package.json
COPY apps/docs/package.json ./apps/docs/package.json

# Install dependencies
RUN bun install --ignore-scripts

# Copy rest of the code
COPY . .

ENV NODE_ENV=production
EXPOSE 8080

WORKDIR /app/server
CMD ["bun", "start"]