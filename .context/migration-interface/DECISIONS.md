# Decisions

Append-only log of architectural and design decisions.

## 2026-04-29 — Project lives in `autumn/.context/`, not the outer worktree
The work targets first-class billing actions in `autumn/server/src/internal/billing/v2/actions/` and ships with tests in `autumn/`. Context is colocated with the code it describes. The outer `.context/migration-interface/` holds only a redirect README.

## 2026-04-29 — Phase 1 is cataloging, not designing
The user explicitly asked to survey existing migration & import scripts before committing to interface shape. Risk of premature lock-in is high — there are at least three classes of patterns (DB-only mutations, DB+Stripe mutations, imports with balance carryover) and each could break the proposed shape differently. Output of Phase 1 is a verdict-per-script catalog.

## 2026-04-29 — Build as core product feature, not internal tooling
Will eventually surface to users on the dashboard. Implications: lives in `autumn/server/src/internal/operations/` (peer to `billing/v2/`), has integration tests, no `as any`, follows full billing-action conventions for the heavyweight executors (`setupBillingContext` → compute Autumn plan → `evaluateStripeBillingPlan` → execute).

## 2026-04-29 — Planner + Executor model, not single billing action
Migrations and imports differ in HOW they produce a plan but converge in HOW the plan executes. A single `migrate` action would conflate heterogeneous mutation surfaces (catalog, customer product graph, balance, Stripe repair) into one sprawling compute function. Splitting produces:
- Durable, inspectable, persistable `OperationPlan` artifact
- Dry-run identical to live (only `apply()` differs)
- Pluggable planners (MigrationDefinition, ImportDefinition) emit same operation graph
- Specialized executors per mutation surface, each with own idempotency/guards
- Reuses billing v2 pipeline INSIDE the CustomerProductGraphOperation executor — no replacement, just orchestration above

## 2026-04-29 — Operations typed by mutation surface, not lifecycle intent
Initial design used `PlanOp = expire | insert | swap | patch` (lifecycle-flavored). Better: `Operation = CatalogOperation | CustomerProductGraphOperation | CustomerEntitlementOperation | BalanceOperation | StripeRepairOperation | CacheInvalidationOperation`. Each surface has different idempotency, transaction boundaries, and concurrency rules — surface-typed ops let executors specialize cleanly.

## 2026-04-29 — `is_custom` decoupled from "uses shared catalog rows"
Today `setupCustomFullProduct` always mints fresh per-customer Price/Entitlement rows when customize is provided. For 10k-customer migrations this creates 10k Stripe prices unnecessarily. New model: `ProductItemPatch.add_existing { entitlement_id, price_id }` references shared catalog rows by id; `is_custom` becomes purely an ownership flag (one-off vs catalog), not "this row is per-customer." Existing custom rows untouched; new code uses new model.

## 2026-04-29 — Ownership is first-class
Today repair logic is bespoke per-script because we can't distinguish imported from user-created customer_products. New model: `Ownership { origin: "imported"|"user_created"|"migrated", source?, imported_at? }` on every TargetAssignment. Likely stored as new column on `customer_products`. Unblocks safe re-runnable imports and convergence/repair semantics.
