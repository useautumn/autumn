# Autumn MCP

Mastra-backed MCP library for Autumn operations.

The hosted runtime lives in `apps/mcp-server` and exposes two Streamable HTTP
MCP routes:

- `/mcp` - public, API-shaped operational tools.
- `/internal/mcp` - internal Autumn agent tool.

## `/mcp`

Use this for external MCP clients that should call Autumn operations directly.

Tools:

- `listCustomers`
- `createCustomer`
- `getCustomer`
- `listPlans`
- `createPlan`
- `getPlan`
- `previewAttach`
- `attach`
- `previewUpdateSubscription`
- `updateSubscription`
- `previewCreateSchedule`
- `createSchedule`

The write tools are marked destructive. Clients should call the matching preview
tool first where one exists and only call a write tool after explicit user
confirmation.

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
OAuth uses the Autumn Better Auth issuer from `MCP_SERVER_URL`:

- local default: `http://localhost:8080/api/auth`
- production default: `https://api.useautumn.com/api/auth`

For production-like local testing:

```sh
MCP_SERVER_URL=https://api.useautumn.com bun -F @autumn/mcp-server start
```
