FROM oven/bun:1.3.10 AS pruner
WORKDIR /app

COPY . .
RUN bunx turbo@2.9.14 prune @autumn/mcp-server --docker

FROM oven/bun:1.3.10
WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN mkdir -p scripts && touch scripts/preload-env.ts
RUN bun -e 'const fs = require("fs"); const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); pkg.workspaces.packages = ["shared", "apps/mcp-server", "packages/ksuid", "packages/mcp"]; delete pkg.dependencies; delete pkg.devDependencies; delete pkg.scripts; fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));'
RUN rm bun.lock && bun install --production --ignore-scripts

COPY --from=pruner /app/out/full/ .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "-F", "@autumn/mcp-server", "start"]
