---
author: john + claude
feature: balance-worker-pooled-balances
date: 2026-09-22
status: ready-for-review
---

# Pooled balances on the balance worker

The worker never sees a pool. Three cuts each drop it on their own, so `deduct` selects no rows
and `computeTrack` throws `feature_not_found` (`computeTrack.ts:34-39`). Check answers
`allowed: false, feature_not_attached` with a 200: a silent wrong answer.

## How a pool is stored

One customer, three Pro entities, `pooled: true` monthly messages item (`pooled-balance-usage-alert.test.ts:56-96`):

```
pooled_balances (1)   granted 100_000 · interval month · reset_mode subscription
      │               customer_entitlement_id ──► POOL_CE
      │
POOL_CE               is_pooled_balance true · customer_product_id null
                      internal_entity_id null · balance 100_000   ◄── the one live balance
      │
pooled_balance_contributions (3)   current_contribution [10_000, 10_000, 80_000]
      │                            ──► source cusProduct + source cusEnt per entity
      │
SOURCE_CE ×3          entitlement.pooled true · is_pooled_balance false
                      pooled_contribution_id set · balance 0       ◄── never moves
```

`granted` lives on `pooled_balances`, not on the entitlement (the synthetic one carries
`allowance: 0`): `cusEntToStartingBalance.ts:38`, `cusEntsToAllowance.ts:37` read
`cusEnt.pooled_balance.granted` from a join.

## What the legacy path does

Nothing pooled-specific at deduction time. `getFullSubjectRowsQuery.ts:332-359` loads the pool
as a third bucket `pooled_customer_entitlements` (joined with its `pooled_balances` row, so
`granted` rides along); `fullSubjectToCustomerEntitlements.ts:67-78` folds it into the selection
with `customer_product: null` and drops source rows. From there the pool is an ordinary
customer-level row: sorted shortest-reset-first, deducted by the same Lua, written back through a
third loop in `applyDeductionUpdateToFullSubject.ts:100-115`. An entity track sees the customer's
pool because the subject predicate admits `internal_entity_id IS NULL` rows.

Worked (`track-pooled-balances.test.ts:237-315`): hourly pool 100 + monthly pool 200, track 120
through an entity holding neither → hourly 100→0, monthly 200→180, `granted 300, remaining 180`,
breakdown of two rows with `plan_id: null`.

## The three cuts on the worker

```
CUT 1  subjectRowsSql.ts:68-86     WHERE ce.pooled_balance_id IS NULL AND ce.pooled_contribution_id IS NULL
                                   no pooled_balances join at all → no pool row, no source row, no granted
CUT 2  workerCustomerEntitlement.ts:4-31   strict pick without is_pooled_balance / pooled_balance_id /
                                   pooled_contribution_id → a pool row that got in classifies as a SOURCE and is dropped
CUT 3  workerFullSubject.ts:33-45   no pooled_customer_entitlements bucket; subjectStateToFullSubject never builds one
```

Latent fourth: even hydrated, `resolveRowBounds.ts:113` → `cusEntToStartingBalance` needs
`cusEnt.pooled_balance.granted`; the worker row has no joined pool, so grant would read as the
synthetic entitlement's `allowance: 0`.

Also: the pool's `granted` changes without any write to the pool cusEnt (billing patches
`pooled_balances.granted`, the cache via `applyFieldUpdates.lua:236`), so the worker's copy needs
its own evict trigger from wherever `pooled_balances` is written.

`validateMeteringEntitlement.ts:40-46` already names `pooled_balance_not_supported`, but only the
initialize/shadow path consults it; live hydration does not.

## Tests

No engine, worker or postgres unit test mentions pooled. Integration files that track or check a
pool, all failing on the worker path today: `track/pooled-balances/*` (3 files),
`track/usage-alerts/pooled-balances/*`, `track/spend-limit/pooled-balances/*`,
`usage-windows/pooled-balances/*`, `check/pooled-balances/*`, `scenarios/pooled-balances/*`, plus
the `billing/pooled-balances/*` and `licenses/pooled-balances/*` files that call track/check.
Licenses have a second blocker: `subjectRowsSql.ts:58` drops products with a
`customer_license_link_id`.
