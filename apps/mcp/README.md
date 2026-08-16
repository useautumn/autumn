# Autumn MCP host

Extracted Streamable HTTP host for Autumn MCP. **Unit 1:** mcp-use v2 shell + `ping` only.

Product tools, OAuth, and `https://mcp.useautumn.com` still run on `@autumn/leaf` until later units.

```sh
bun run mcp
```

Default: `http://localhost:3100/mcp` (`MCP_PORT` to override). Leaf stays on `3099`.

## Pins (unit 1)

- `mcp-use@2.2.0` — latest version older than the repo `minimumReleaseAge` (3 days). Bump when 2.2.x clears the gate.
- `zod@4.3.6` — mcp-use’s Standard Schema path needs Zod 4 `jsonSchema`. Isolated to this app; the rest of the monorepo stays on Zod 3.
