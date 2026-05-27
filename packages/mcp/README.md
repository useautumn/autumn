# Autumn MCP

Mastra-backed MCP server for Autumn operations.

The public MCP surface is intentionally small:

- `ask_autumn({ message, context? })`

Internally, `ask_autumn` can look up customers/plans, preview billing changes,
and apply confirmed billing writes. Billing writes are preview-first: the server
stores the pending action internally and users confirm with a follow-up message
such as `confirm` or cancel with `cancel`.

## Local

From the repo root:

```sh
bun run mcp
```

This starts the Streamable HTTP server at `http://localhost:2718/mcp` using the
local Better Auth OAuth flow.

For static local auth:

```sh
bun -F @autumn/mcp build
node packages/mcp/bin/mcp-server.js serve --secret-key sk_test --server-url http://localhost:8080
```
