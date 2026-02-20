---
description: Add a new Autumn API endpoint into autumn-js (backend route, generated schemas, better-auth plugin, React hooks, docs, and sdk-test UI)
argument-hint: [endpoint-name] [sdk-namespace.method]
---

# Add to Autumn JS

Add a new endpoint end-to-end in `packages/autumn-js` following existing patterns (especially billing attach/open portal).

## Inputs you need

- Endpoint route name in autumn-js (example: `openCustomerPortal`)
- SDK method path (example: `autumn.billing.openCustomerPortal(args)`)
- SDK model file in `packages/sdk/src/models` (example: `open-customer-portal-op.ts`)
- Whether frontend helper needs redirect behavior (`openInNewTab`) and default URL behavior

## Required implementation checklist

1. Update backend route names and route config:
- `packages/autumn-js/src/backend/core/types/routeTypes.ts`
  - Add to `ROUTE_NAMES`
- `packages/autumn-js/src/backend/core/routes/routeConfigs.ts`
  - Add route entry with `route`, `sdkMethod`, and `bodySchema`
  - Import schema from `packages/autumn-js/src/generated`

2. Update schema generation for better-auth body validation:
- `packages/openapi/utils/zodSchemaGeneration.ts`
  - Add `SCHEMA_SOURCES` entry for the SDK model file
- Ensure generated schema file exists in `packages/autumn-js/src/generated/`
  - If not generated yet, add it manually using the same style as existing generated files
- Export it from `packages/autumn-js/src/generated/index.ts`

3. Update better-auth plugin endpoint map:
- `packages/autumn-js/src/better-auth/index.ts`
  - Add `createAutumnEndpoint("<routeName>", handleRoute)`

4. Update client and types:
- `packages/autumn-js/src/types/params.ts`
  - Add client params type (usually omit protected fields, add `openInNewTab?` when redirecting)
- `packages/autumn-js/src/types/index.ts`
  - Re-export alias
- `packages/autumn-js/src/react/index.ts`
  - Export the new client params type
- `packages/autumn-js/src/react/client/IAutumnClient.ts`
  - Add interface method
- `packages/autumn-js/src/react/client/AutumnClient.ts`
  - Add HTTP route call

5. Update hook actions and docs:
- `packages/autumn-js/src/react/hooks/internal/useCustomerActions.ts`
  - Add method implementation
  - If redirect flow: support `openInNewTab` and default `returnUrl` to `window.location.href`
- `packages/autumn-js/src/react/hooks/useCustomer.ts`
  - Add method to `UseCustomerResult`
  - Add concise JSDoc for the method and update return summary

6. Add sdk-test scenario controls:
- `apps/sdk-test/app/scenarios/core/use-autumn/page.tsx`
  - Add new action tab/button
  - Add compact input(s) for required params (for billing portal include `returnUrl`)
  - Wire action through `runAction`

## Billing endpoint specifics

For billing endpoints with redirect URLs:
- Add `openInNewTab?: boolean` to frontend client params type
- In `useCustomerActions`, default `returnUrl` to `window.location.href` when missing
- Reuse the existing `redirectToUrl` helper pattern from `attach`

## Validation checklist

- Run scoped Biome checks only on touched files:
`bunx biome check <paths>`
- If formatting/import issues appear, run:
`bunx biome check --write <paths>`
- Avoid running `dev` or `build` commands.

## Done criteria

- Route works in backend core handler and better-auth endpoints
- Generated schema is available and imported in route config
- React client + hook exposes the new action
- `useCustomer` type/JSDoc includes it
- sdk-test page has a working action button and inputs
