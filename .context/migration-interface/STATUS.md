# migration-interface

## Goal
Design a shared billing-action interface for customer migrations and imports so scripts stop hand-rolling Stripe + Autumn DB orchestration. Eventually exposed to users on the dashboard, so it must be a first-class product feature with tests — not an internal tool.

## Current Phase
Phase 1: Discovery complete (catalog written). PROPOSAL.md v2 drafted — planner + executor model with typed operations. Awaiting user review of architecture and 8 open design questions.

## Branch
john/migration-interface

## Active Tasks
- (none yet — will create parallel cataloging tasks if Phase 1 surface gets large)

## What's Done
- Phase 1 discovery: cataloged `scripts/src/common/migrations/` (23 files), `scripts-v2/runs/` migration scripts, mintlify+firecrawl import chains, and billing v2 action machinery (`multiAttach`, `createSchedule`, `updateSubscription`, `evaluateStripeBillingPlan`, `AutumnBillingPlan`, `customizePlanV1`, `setupCustomFullProduct`).
- See `CATALOG.md` for full pattern inventory and `PROPOSAL.md` for the layered-interface design.

## What's Next
- Walk through `PROPOSAL.md` with user — confirm 3-layer model and discuss the 7 open design questions
- Read existing `actions/migrate/migrate.ts` to decide extend-vs-replace
- Lock Layer 3 scope (include `patch` op? or split into `migrate` + extended `updateSubscription`?)
- Begin Phase 2: design `MigrateParams`, `MigrateBillingContext`, `computeMigratePlan` signatures concretely

## Active Blockers
- None

## Key Files
- `server/src/internal/billing/v2/actions/index.ts` — where new action(s) will register
- `server/src/internal/billing/v2/actions/multiAttach/multiAttach.ts` — closest existing analog
- `server/src/internal/billing/v2/actions/createSchedule/createSchedule.ts` — schedule pattern reference
- `server/src/internal/billing/v2/actions/updateSubscription/updateSubscription.ts` — single-subscription mutation reference
- `server/src/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan.ts` — Autumn plan → Stripe state mapper
- `shared/api/billing/common/customizePlan/customizePlanV1.ts` — public customize schema
- `shared/api/products/items/apiPlanItemV1.ts` — public plan item shape
