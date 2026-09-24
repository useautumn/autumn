# balances.update on the balance worker

## Goal

`balances.update` and `/usage` write through the worker as one engine command,
decided on the worker's live state. Today they write Redis/Postgres around the
worker and rely on an after-the-fact evict (`/usage` never evicts at all).

## Shape

```
server
handleUpdateBalance / handleSetUsage
  updateBalanceV2
    async? -> SQS -> consumer ---+
    runUpdateBalance <-----------+     the one gate
      worker off -> runUpdateBalanceV2           (legacy, untouched)
      worker on  -> runBalanceWorkerUpdateBalance
                      withPaidAllocatedFallback
                        worker:   client.updateBalance(command)
                        postgres: runUpdateBalanceV2   (legacy lane)
```

Gate: `isBalanceWorkerRolloutEnabled()`. The empty `isFullSubjectRolloutEnabled`
blocks in both handlers are dead and go.

## Propagation (API → command, 1:1)

```
remaining / current_balance -> remaining?          ┐
add_to_balance              -> addToBalance?       ├─>  setBalance
usage                       -> usage?              ┘
included_grant              -> includedGrant?     ───>  setIncludedGrant
next_reset_at               -> nextResetAt?       ───>  setNextResetAt
expires_at                  -> expiresAt?         ───>  setExpiresAt
feature_id, balance_id,     -> featureId, filters ───>  every step's rows
  customer_entitlement_id,
  interval, entity_id
```

## Engine: computeUpdateBalance

```
rows   = feature's own rows, filtered           none -> 404
guards = invoice credit, paid allocated v1      -> refuse
state ──> setBalance ──> setIncludedGrant ──> setNextResetAt ──> setExpiresAt
          each step reads the state the previous one leaves
──> ONE mutation, no effects
```

| Step | Rule (legacy parity) |
|---|---|
| setBalance | target = `remaining`, or `granted + prepaid − usage`; value = Σ main balance − target (rollovers excluded from Σ, but drawn first on a set-down). No target → value = −`addToBalance`. Target wins when both are sent. Unlimited row first → set it to target directly. `deduct` with `overageBehavior: "allow"`: no floor, no spend-limit cap, no refund ceiling. |
| setIncludedGrant | `adjustment += target − allowance` (no rollovers) on the first row, or its entity entry when entity-scoped. |
| setNextResetAt | row with earliest `next_reset_at`; lifetime → 400. |
| setExpiresAt | row with earliest `expires_at`; paid recurring → 400. |

Usage windows: untouched by a target, a refund or a grant edit. A negative
`add_to_balance` is consumption and counts (`executeRedisDeductionV2.ts:191`).

## Files

```
packages/balance-engine/src/
  commands/updateBalance/
    computeUpdateBalance.ts     rows -> guards -> 4 steps -> mutation
    selectUpdateBalanceRows.ts  feature rows + filters, 404
    steps/
      setBalance.ts
      setIncludedGrant.ts
      setNextResetAt.ts
      setExpiresAt.ts
    types/
      updateBalanceCommand.ts
      updateBalanceResult.ts
  deduction/                    shared with track, extended:
    types/deductionRequest.ts     + filters, + rowSelection ("funding" | "feature")
    setup/selectDeductionRows.ts  applies them
    overageBehavior               + "allow"

apps/balance-worker/src/processor/commands/
  updateBalance.ts              mirrors track.ts
packages/balance-worker-client/  + updateBalance method

server/src/internal/balances/updateBalance/
  runUpdateBalance.ts           the one gate
  balanceWorker/
    runBalanceWorkerUpdateBalance.ts
    updateBalanceParamsToCommand.ts
  v2/                           untouched
```

## Decisions

- **D1 One command, not a split.** A billing plan for grant/columns plus a track
  variant for balance would be 2 mutations, a stale server read, and a whole-map
  `entities` SET that clobbers a concurrent track.
- **D2 All-or-nothing.** Legacy applies fields one by one; the command applies
  them in one mutation, so a refused field blocks the rest.
- **D3 Legacy is the fallback lane.** With the flag on, requests skip the legacy
  cache and its Redis executor already defers paid allocated to Postgres, so
  `runUpdateBalanceV2` runs verbatim inside `withPaidAllocatedFallback`.
- **D4 Idempotency.** `commandId` = `ctx.id`; async uses the payload's
  `requestId`, so SQS redelivery dedups on the worker.
- **D5 No effects.** No auto top-up (legacy passes `triggerAutoTopUp: false`)
  and no balance webhooks (legacy fires none). Confirm.
- **D6 Refresh.** The route's `flushBalances` evict after a worker write drops a
  fresh copy. Configs are route-level, so the worker path sets
  `skipCacheDeletion` the way the async path already does
  (`updateBalanceV2.ts:222`). The fallback lane still evicts inside the wrapper.
