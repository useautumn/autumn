# Balance worker: customers.get / entities.get parity

Audit of `readBalanceWorkerSubject` (worker path) against `getFullSubjectQuery`
(legacy path). Each item is one difference in what the API renders. Work them
one at a time, top to bottom. Tick when landed.

Key files:
- legacy SQL: `server/src/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.ts`
- legacy normalize: `server/src/internal/customers/repos/getFullSubject/subjectQueryRowToNormalized.ts`
- worker SQL: `packages/postgres/src/subjects/repos/getSubjectRows/subjectRowsSql.ts`
- worker join: `packages/balance-engine/src/utils/subjectUtils/convertSubjectUtils.ts`
- worker → FullSubject: `server/src/internal/balanceWorker/subject/workerStateToFullSubject.ts`

## Differences

- [x] 1. Unused seat rows leak into the customer view. Legacy excludes
  `customer_license_link_id IS NOT NULL` at customer level
  (`getFullSubjectRowsQuery.ts:161`). Worker `cus_products` keeps every
  `internal_entity_id IS NULL` row with a live parent (`subjectRowsSql.ts:64`).
  Unassigned seats exist (`licenseAssignmentRepo.ts:140`). Renders one extra
  subscription per unused seat.
- [x] 2. Pooled contribution rows stay under products. Legacy `cus_entitlements`
  requires `pooled_contribution_id IS NULL` (`:262`). Worker keeps them on purpose
  (`subjectRowsSql.ts:86`). Balances filter them, but plan items come from
  `customer_entitlements` via `cusProductToProduct` (`convertCusProduct.ts:150`).
- [x] 3. Drained loose rows after hydration. Legacy re-applies
  `filterDrainedLooseEntitlements` on every cache hit. Worker filters at SQL only;
  a loose grant tracked to 0 renders with balance 0 until evict.
- [x] 4. Expiry clock. Legacy uses DB `now()` per read; worker uses hydration
  `occurredAt`. cusEnts are re-checked at render (`isCusEntExpired`), rollovers
  are not.
- [x] 5. Product order. Legacy: entity first, relevant status, has prices, not
  add-on, created_at desc. Worker: created_at desc, then customer part before
  entity part. Nothing re-sorts in the renderer. Changes `subscriptions` order
  and `legacyData[plan_id]` last-wins.
- [x] 6. Boolean flag dedup. Legacy keeps one row per boolean feature
  (active > past_due > loose > scheduled, `subjectQueryRowToNormalized.ts:157`).
  Worker passes all rows; `getApiFlag` takes `cusEnts[0]` after an unstable sort.
- [x] 7. `free_trial` on products. Legacy attaches the `free_trials` row
  (`normalizedToFullSubject.ts:350`). Worker catalog has no free trials, field
  undefined. Affects `expand=subscriptions.plan` and
  `isCustomerProductRevertingTrial`.
- [~] 8. (skipped, v1 allocated is deprecated) `replaceables` always `[]` (`workerStateToFullSubject.ts:25`). Renders
  `unused: 0` for allocated v1 features (`balanceUtils.ts:81`).
- [~] 9. (skipped, being deprecated; the worker path never aggregates) Entity aggregation for API < V2.4. Legacy computes
  `aggregated_customer_*` for customer subjects when `shouldAggregateEntityData`.
  Worker never does. Old clients lose entity subscriptions and balances.
- [x] 10. Caps. Legacy: 200 products, 200 loose, 200 pooled. Worker: unbounded.
  Invoices already capped at 10 on both.
- [x] 11. Deleted entities (filter dropped to match prod). Worker filters `e.deleted IS NOT TRUE`; legacy does
  not. entities.get on a deleted entity now 404s. Confirm intended.

## Read side effects dropped on the worker path

- `lazyResetSubjectUsageWindows`: engine reset has no usage-window roll. Response
  still right (closed windows derive as 0), but the roll is never persisted.
- `checkPendingMigrationsForCustomer`: no-op today (`LAZY_MIGRATION_RUNS_DISABLED = true`).
- `lazyResetSubjectEntitlements`: covered by `ensureSubjectCurrent → advanceResets`.

## Verified equivalent

Customer lookup and tie-break; RELEVANT_STATUSES; seat liveness via pool parent
plus lifecycle inheritance; loose liveness predicate incl. `next_reset_at`;
pooled row scoping and license-pool liveness; rollover scope and order;
subscriptions by kept products; invoices (10, customer subjects); plan license
effective items; customer-level plus entity-own composition for entity subjects;
usage windows (scope differs, renders same); log snapshot strips render-only
columns but the store discards `after`, so resident state is always Postgres
rows plus mutations; entity subjects carry customer licenses on the worker but
the entity renderer ignores them.
