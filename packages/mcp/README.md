# Autumn MCP

Mastra-backed MCP servers for Autumn operations.

This package exposes two Streamable HTTP MCP routes from the same runtime:

- `/mcp` - public, API-shaped operational tools.
- `/internal/mcp` - internal Autumn agent tool.

## `/mcp`

Use this for external MCP clients that should call Autumn operations directly.

Tools:

- `listCustomers`
- `getCustomer`
- `listPlans`
- `getPlan`
- `previewAttach`
- `attach`
- `previewUpdateSubscription`
- `updateSubscription`

The write tools are marked destructive. Clients should call the matching preview
tool first and only call a write tool after explicit user confirmation.

## `/internal/mcp`

Use this for Autumn-controlled agent flows.

Tools:

- `ask_autumn({ message, context? })`

`ask_autumn` can look up customers/plans, inspect scoped Axiom logs when
available, preview billing changes, and apply confirmed billing writes. Billing
writes are preview-first: the server stores the pending action internally and
executes it only after a follow-up confirmation.

## Local

From the repo root:

```sh
bun run mcp
```

This starts both MCP routes:

- `http://localhost:2718/mcp`
- `http://localhost:2718/internal/mcp`

OAuth metadata is route-aware:

- `http://localhost:2718/.well-known/oauth-protected-resource/mcp`
- `http://localhost:2718/.well-known/oauth-protected-resource/internal/mcp`

OAuth uses the Autumn Better Auth issuer from `--server-url`:

- local default: `http://localhost:8080/api/auth`
- production: `https://api.useautumn.com/api/auth`

For static local auth:

```sh
bun -F @autumn/mcp build
node packages/mcp/bin/mcp-server.js serve --secret-key sk_test --server-url http://localhost:8080
```

For production-like OAuth:

```sh
node packages/mcp/bin/mcp-server.js serve --oauth-enabled --server-url https://api.useautumn.com
```
