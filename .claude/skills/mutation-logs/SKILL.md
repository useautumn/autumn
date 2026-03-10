---
name: mutation-logs
description: Reference for Autumn balance mutation logs, lock receipts, ordered deduction provenance, and finalizeLock reconciliation semantics. Use when working on lock receipts, deduction provenance, mutation-log sync, or finalize/release flows.
---

# Mutation Logs Guide

## Summary

Autumn now treats ordered `mutation_logs` as the provenance source for balance deductions.

This replaces the earlier idea of encoding provenance inside:

- `DeductionUpdate.balance_delta`
- `DeductionUpdate.adjustment_delta`
- `DeductionUpdate.entity_deltas`
- `RolloverUpdate.balance_delta`
- `RolloverUpdate.usage_delta`
- `RolloverUpdate.entity_deltas`

Those additive delta fields were useful as an intermediate step, but they are not the right long-term model because they are:

- aggregated
- unordered
- not safe for reverse replay of partial lock releases

The correct source of truth is an ordered array of per-write mutation log items.

## Core Model

There are now two separate outputs from deduction:

### 1. Final-state updates

These remain:

- `DeductionUpdate`
- `RolloverUpdate`

They are for:

- applying updated balances to `FullCustomer`
- sync batching
- existing response helpers

They should describe final post-deduction state only.

### 2. Ordered mutation logs

These are the provenance layer.

They are for:

- lock receipt persistence
- reverse-order unwind in `finalizeLock`
- future mutation-log replay to Postgres

They must preserve the exact order in which Redis deductions were queued.

## Mutation Log Item Shape

TypeScript shape:

```ts
type MutationLogItem = {
  target_type: "customer_entitlement" | "rollover";
  customer_entitlement_id: string | null;
  rollover_id: string | null;
  entity_id: string | null;
  balance_delta: number;
  adjustment_delta: number;
  usage_delta: number;
  value_delta: number;
};
```

Field meanings:

- `target_type`
  - whether the write targeted a `customer_entitlement` or a rollover
- `customer_entitlement_id`
  - required for main balance writes and rollover parent linkage
- `rollover_id`
  - present only for rollover items
- `entity_id`
  - present for entity-scoped writes
- `balance_delta`
  - exact Redis balance delta applied
- `adjustment_delta`
  - exact granted/adjustment delta applied
- `usage_delta`
  - exact rollover usage delta applied
- `value_delta`
  - feature-unit amount represented by this step

## Why `value_delta` Exists

`balance_delta` is in credits.

`value_delta` is in the feature’s own logical units.

Example:

- feature usage = `5`
- `credit_cost = 2`
- actual Redis balance change = `-10`

Then:

- `balance_delta = -10`
- `value_delta = 5`

This is needed because `finalizeLock` reconciles in feature/value units, not raw credits.

For one receipt, total locked value is:

```ts
sum(item.value_delta for item in receipt.items)
```

This total is signed:

- positive for deductions / tracked usage
- negative for refunds / credits

## Where Mutation Logs Are Created

Ordered mutation logs are appended during Lua deduction, not reconstructed later.

### Source of truth

`server/src/_luaScriptsV2/deductFromCustomerEntitlements/contextUtils.lua`

`init_context(...)` creates:

- `context.mutation_logs = {}`

### Append points

Mutation logs are appended from:

- `queue_balance_update(...)`
- `queue_rollover_update(...)`

This is the correct abstraction boundary because these functions already know:

- which logical bucket is being changed
- the exact Redis deltas
- the order in which writes are queued

Do not rebuild receipt items later from `updates` / `rollover_updates`.

That loses order.

## Lock Receipt Rules

Lock receipts are now stored from ordered mutation logs directly.

Relevant file:

- `server/src/_luaScriptsV2/deduction/lock/lockReceipt.lua`

Current rule:

- `receipt.items = mutation_logs`

not:

- rebuild from `updates`
- rebuild from `rollover_updates`

Lock receipts also store both:

- `lock_key`
- `hashed_key`

because:

- `lock_key` is the caller-facing logical key
- `hashed_key` is used to derive the Redis receipt key

## Redis Key Rules

The Redis receipt key is built from the hashed key, not the raw key.

Relevant helper:

- `server/src/internal/balances/utils/lock/buildLockReceiptKey.ts`

Current format:

```ts
`{${orgId}}:${env}:lock:${lockKey}`
```

The braces around `orgId` are intentional so the receipt key hashes to the same Redis cluster slot as the full-customer cache key.

## Lock Key Parsing Rules

Relevant helper:

- `server/src/internal/balances/utils/lock/parseCheckParamsForLock.ts`

Rules:

- if caller passes `lock.key`, keep it as the logical `key`
- also compute `hashed_key = Bun.hash(key).toString()`
- if no key is passed, generate a KSUID logical key and hash that
- if `key.length > 256`, throw

This means:

- user-facing API returns the logical `lock_key`
- internal Redis receipt storage uses the hashed key

## FinalizeLock Mental Model

Do not think in terms of “refund vs deduct”.

Think in terms of:

- current locked value
- desired final value
- reconcile from one to the other

### Correct abstraction

`finalizeLock` should reconcile from `locked_value` to `final_value`.

Cases:

1. Same sign, smaller magnitude
   - unwind part of the existing receipt
   - walk receipt items backward

2. Same sign, larger magnitude
   - keep the existing receipt as-is
   - deduct/refund the extra delta using the normal engine

3. Cross zero
   - fully unwind existing receipt back to zero
   - apply the remaining amount in the opposite direction using the normal engine

### Important rule

Do not implement finalize as:

- reverse the whole receipt
- re-run normal deduction for the final amount

That is not safe for provenance correctness when balances changed after the original lock.

## Why Ordered Logs Matter

Example original lock order:

- hourly `10`
- monthly `5`
- lifetime `2`

If finalize wants to reduce the locked value, the unwind order must be:

- lifetime first
- monthly second
- hourly last

This only works if receipt items are stored in actual deduction order.

Aggregated update maps cannot guarantee that.

## Redis vs Postgres Status

### Redis path

Redis deduction is now the authoritative ordered provenance path.

Relevant files:

- `server/src/_luaScriptsV2/deductFromCustomerEntitlements/contextUtils.lua`
- `server/src/_luaScriptsV2/deductFromCustomerEntitlements/deductFromMainBalance.lua`
- `server/src/_luaScriptsV2/deductFromCustomerEntitlements/deductFromRollovers.lua`
- `server/src/_luaScriptsV2/deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua`
- `server/src/internal/balances/utils/deduction/executeRedisDeduction.ts`

`executeRedisDeduction` now exposes:

- `updates`
- `rolloverUpdates`
- `mutationLogs`

### Postgres path

Postgres deduction has not yet been upgraded to emit real ordered mutation logs.

Current behavior:

- `executePostgresDeduction` exposes `mutationLogs: []`

This is a compatibility placeholder so callers can converge on one return shape.

Future work:

- `performDeduction.sql` should emit ordered mutation log items directly
- do not reconstruct them later from final SQL updates

## Current Invariants

- lock receipts must persist ordered mutation logs directly
- mutation logs must be appended at the moment writes are queued
- final-state updates and mutation provenance are separate structures
- `value_delta` is required for partial reconcile logic
- Redis receipt keys use hashed keys and shared-slot formatting
- finalize must unwind receipt items backward for partial release

## When Editing This System

If you change deduction behavior, always check:

1. Are ordered mutation logs still appended in the true write order?
2. Does each mutation item still include correct `value_delta`?
3. Are lock receipts still persisted from `mutation_logs`, not rebuilt?
4. Did any change accidentally reintroduce provenance into aggregated update maps?
5. If touching Postgres deduction, did the SQL path preserve parity with the Redis executor return shape?
