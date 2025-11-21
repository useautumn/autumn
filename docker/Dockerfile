FROM oven/bun:1.3.2
WORKDIR /app

# Install Node.js to fix Bun bug with msgpackr-extract postinstall scripts
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Copy root package files
COPY package.json .
COPY bun.lock .

# Copy workspace package.json files
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
COPY vite/package.json ./vite/package.json
COPY scripts/package.json ./scripts/package.json

# Install dependencies
RUN bun install

# Copy rest of the code
COPY . .

ENV NODE_ENV=production
EXPOSE 8080

WORKDIR /app/server
CMD ["bun", "start"]