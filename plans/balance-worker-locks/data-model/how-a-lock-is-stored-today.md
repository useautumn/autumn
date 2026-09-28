# How a lock is stored today

A lock is not a reservation. The balance is really deducted when the lock is taken, and a receipt records how to undo it. No API response has a "reserved" or "locked" field.

```
scenario   customer has 15 messages
action     POST /check  { required_balance: 8, lock: { lock_id: "L1", enabled: true } }
expect     balance 15 -> 7, one event of value 8, receipt written

action     POST /balances.finalize  { lock_id: "L1", action: "confirm", override_value: 5 }
expect     balance 7 -> 10, one event of value -3, receipt deleted
```

Test: `server/tests/integration/balances/lock/basic/check-with-lock-refund.test.ts:28`.

## The receipt

One Redis string per lock. Nothing in Postgres.

```
key    {<orgId>}:<env>:lock_receipt:<Bun.hash(lock_id)>
ttl    expires_at + 1h, or now + 24h when no expires_at

{
  lock_id, customer_id, feature_id, entity_id,
  expires_at, created_at, properties, overage_behavior,
  items: [                      one per bucket touched, in deduction order
    { target_type: "customer_entitlement" | "rollover",
      customer_entitlement_id, rollover_id, entity_id,
      credit_cost, balance_delta, usage_delta, value_delta,
      usage_attribution_delta? }
  ]
}
```

Key: `server/src/internal/balances/utils/lock/buildLockReceiptKey.ts:10`. The uniqueness scope is org + env + `lock_id`, not the customer.

Catch: `expires_at` may be at most 24 hours out (`parseCheckParamsForLock.ts:40`), so no lock outlives a day.

Catch: when the 24 hour TTL fires with no finalize, the receipt just disappears. The deduction stays. That is an implicit confirm.

## Finalize in one line of arithmetic

`lockValue L` is the sum of `items[].value_delta`. `finalValue f` is `0` for release, else `override_value ?? L`.

| case | what moves |
|---|---|
| `f == L` | nothing. No deduction, no event. Receipt deleted. |
| `f < L` | refund `L - f`, walking `items` **backwards**, newest bucket first |
| `f > L` | a fresh forward deduction of `f - L`, under the **receipt's** overage behaviour |
| release, expiry | `f = 0`, full refund |

Params: `shared/api/balances/finalizeLock/finalizeLockParamsV0.ts:3`. Finalize carries `lock_id`, `action`, `override_value`, `properties`. **It does not carry a customer id.**

## How exactly-once works today

A second Redis key, `<receiptKey>:claim`, set with `NX` and a one hour TTL. Whoever sets it may finalize. A concurrent finalize gets a 409. After success both keys are deleted, so a later finalize gets "Lock not found".

Catch: on the Postgres fallback path the deduction commits first and the receipt is written to Redis afterwards (`executePostgresDeductionV2.ts:125-243`). A crash between the two leaves a deduction that can never be released.

## What the worker already has

A worker track result carries `deltas`, one per row drawn from, with the same fields as `items` above (`packages/balance-engine/src/deduction/types/deductionDelta.ts:8`). Negating them and applying them as increments is an exact inverse. Re-running a deduction with a negative value is **not**: refunds skip rollovers and clamp at the included allowance.
