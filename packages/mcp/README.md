# Autumn MCP

Mastra-backed MCP library for Autumn operations.

The hosted runtime lives in `apps/leaf` (see `src/mcp/http.ts`) and exposes a
Streamable HTTP MCP route:

- `/mcp` - public, API-shaped operational tools.

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

## Local

The routes are served by the `@autumn/leaf` app. From the repo root:

```sh
bun run leaf
```

This starts the MCP route (on the leaf port, `3099` by default):

- `http://localhost:3099/mcp`

OAuth metadata is route-aware:

- `http://localhost:3099/.well-known/oauth-protected-resource/mcp`

OAuth uses the Autumn Better Auth issuer from `--server-url`:
OAuth uses the Autumn Better Auth issuer from `MCP_SERVER_URL`:

- local default: `http://localhost:8080/api/auth`
- production default: `https://api.useautumn.com/api/auth`

For production-like local testing:

```sh
MCP_SERVER_URL=https://api.useautumn.com bun -F @autumn/leaf start
```
