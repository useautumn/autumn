# Rebalance on the balance worker

## Goal

Every purchase (auto top-up, threshold settle, manual top-up, one-off
purchase) is sized by the worker against live balances, inside the plan's
own mutation. No eviction after a top-up. The Postgres lane keeps the same
rules, so both lanes agree.

## How it works

```
server compute (unchanged, + purchase fields)
  autoTopupRebalance: { deltas,                     ← Postgres lane
                        customerEntitlementId,      ┐
                        featureId, quantity,        ├ worker lane
                        creditedCustomerEntitlementId } ┘
  oneOffPurchaseRebalance: { purchases }            (already a purchase)

routing (billingPlanRoutesToWorker)
  a top-up without its purchase fields → Postgres (old saved plans,
    two merged top-ups)
  a top-up's purchase names its customer even with no row written

worker lane
  rebalancesToPlanOps → { op: "rebalance", id, featureId, quantity,
                          creditedId }, appended after the row ops
  a credited expiring grant is inserted at 0; the op fills it
  engine: applyCorePlan → applyPlanRebalances (each sized on the state
          the rows, and the purchases before it, leave)

postgres lane (temporary)
  executeAutumnBillingPlan runs applyPlanRebalances only when
  !rebalancesApplied (rollout off, stale fallback); its Redis patch
  can't run inside the transaction. Removed with the Postgres write path.
```

## Engine layout

```
commands/applyBillingPlan/
  computeApplyBillingPlan.ts      applyCorePlan, then applyPlanRebalances
  applyCorePlan.ts                every op but a rebalance → { changes, state }
  applyPlanRebalances/
    applyPlanRebalances.ts        per op: subject → rebalance() → apply
    purchasedRowToFullSubject.ts  the purchased row's customer/entity view
  toPlanMutation.ts
common/rebalance/
  rebalance.ts                    refundOverage (clampChange, ceiling 0),
                                  then credit the leftover
  selectCustomerEntitlements.ts   feature rows; rows in overage; credited row
```

The worker passes the plan's catalog (`readPlanCatalog`: the customer's,
the named entities', and the plan's new rows), so the engine joins the
state itself.

## Rules (both lanes)

| # | Step | Rule |
|---|------|------|
| 1 | Statuses | Active, PastDue; not org statuses |
| 2 | Feature | exact `feature.id`; no credit systems |
| 3 | Excluded | pooled sources, license seats, expired |
| 4 | Subject | only rows of the purchased row's own customer or entity (D4) |
| 5 | Base order | `sortCusEntsForDeduction`, `reverseOrder: false` |
| 6 | Purchased row | not a candidate; missing → nothing at all |
| 7 | Candidate | `isCustomerEntitlementInOverage`: balance < 0, not boolean, `allowance_type` ≠ unlimited, no `entity_feature_id` |
| 8 | Paydown order | `sortCusEntsForPaydown`: raw `usage_allowed` first, `created_at ?? 0` asc, stable |
| 9 | Per row | `+min(remaining, -balance)`; adjustment, entities, rollovers untouched |
| 10 | Remainder | to the credited row, last |
| 11 | Invoice-credit guard | server compute, before Stripe |

Pinned by `server/tests/unit/balances/auto-topup/rebalance-parity.test.ts`
(21 cases, both lanes against the same expected deltas).

## Decisions

- **Fresher balances.** A track between the job's read and the apply
  changes the split, not the total. Accepted.
- **D1 Expiring grants.** The grant's allowance is the server's planned
  remainder; its balance is the worker's live remainder (they differ only
  in the race). No planned grant but a live remainder → uncapped `+` on
  the first paid-down row, as prod's fixed deltas would.
- **D2 Several purchases of one feature.** Each sized after the previous,
  on both lanes (the Postgres lane re-reads per purchase).
- **D3 Old saved plans.** No purchase fields → Postgres lane, today's code.
- **D4 Subject.** Only the purchased row's own customer or entity is paid
  down. A customer-level top-up no longer pays down entity plans' overage.
- **No eviction.** `autoTopup.ts` no longer invalidates; dev's
  expiring-grant eviction is gone too (the grant lands in worker memory).
  A top-up that takes the Postgres lane with the rollout on leaves the
  worker stale until its next read; rare (unnamed entity, license seats).
- **Billable reads.** `getBillableFullCustomer` reads the worker's view,
  failing open to `CusService.getFull`. The worker's customer view has no
  entity-level products, as the cached-subject path already didn't.
