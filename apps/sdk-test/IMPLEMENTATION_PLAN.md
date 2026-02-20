# SDK Test App Implementation Plan

## Purpose
`apps/sdk-test` is the canonical integration harness for validating `autumn-js` behavior in a Next.js App Router environment.

The app is scenario-driven and optimized for debugging:
- stable identity,
- deterministic API routing,
- compact black/white UI,
- structured payload inspection.

## Current Baseline
Implemented baseline scenario:
- `Core / useCustomer`

Implemented infrastructure:
- `AutumnProvider` in `app/layout.tsx`
- API catch-all route through `autumn-js/next` `autumnHandler`
- Static test identity for deterministic customer resolution
- Sidebar navigation shell (desktop + mobile)
- Structured data viewer components for hook payloads

## Directory Map
- `app/layout.tsx`: Root app shell and provider mounting
- `app/api/autumn/[[...path]]/route.ts`: Backend proxy routing via `autumnHandler`
- `app/scenarios/*`: Scenario pages
- `components/app-sidebar.tsx`: Navigation shell
- `components/debug/*`: Reusable debug panels and JSON viewer
- `lib/scenarios.ts`: Navigation + scenario metadata source of truth
- `lib/autumn/testIdentity.ts`: Static identify payload
- `lib/autumn/debug.ts`: Server debug logging helpers

## Scenario Contract
Each scenario route should include:
1. Hook/action params panel
2. Hook/action state panel
3. Payload viewer panel
4. Action controls (refetch / execute)

## Logging Contract
Server logs must include:
- method
- URL/path
- request body summary (shape only)
- resolved identity

Never log:
- secret keys
- full auth headers
- raw tokens

## How to Add a New Scenario
1. Add route page under `app/scenarios/<integration>/<feature>/page.tsx`
2. Add metadata entry in `lib/scenarios.ts`
3. Reuse `DebugCard` + `DataViewer` + `HookStatePanel`
4. Add status in sidebar (`ready`, `wip`, `planned`)
5. Validate layout on desktop and mobile

## Planned Next Scenarios
- `Core / useAutumn`
- `Core / useEntity`
- `Better Auth / useCustomer`
- `Convex / useCustomer`

## Acceptance Checklist
- [ ] Scenario is discoverable from sidebar and `/`
- [ ] Route renders within compact layout bounds
- [ ] Payloads are inspectable without overflow issues
- [ ] Error and loading states are explicit
- [ ] No secrets appear in logs or UI
