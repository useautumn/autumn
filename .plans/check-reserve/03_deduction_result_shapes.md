# Deduction Result Shapes

## Summary

Additive delta/provenance fields need to be part of our deduction result objects so they can serve both:

- lock receipts now
- mutation log items later

The key rule is:

- keep the existing final-state fields unchanged in meaning
- add delta fields beside them
- compute those delta fields during deduction, not by diffing final snapshots later

This applies to both the Redis Lua path and the Postgres SQL path.

## Why This Change Is Needed

Today, our deduction results are mostly final-state objects.

For example, `DeductionUpdate` gives us:

- final `balance`
- final `adjustment`
- final `entities`
- aggregate `deducted`

That is enough for current snapshot-style consumers, but it is not enough for:

- exact lock receipts
- exact release/refund replay
- future mutation logs

What we need in addition is:

- top-level `balance_delta`
- top-level `adjustment_delta`
- sparse per-entity deltas
- rollover `balance_delta`
- rollover `usage_delta`
- parent `customer_entitlement` linkage for rollover updates

Without these fields, lock receipt creation would need to reconstruct provenance from final snapshots, which is more fragile than recording the change directly when the deduction happens.

## Result Shape Changes

### `DeductionUpdate`

Keep existing final-state fields:

- `balance`
- `additional_balance`
- `adjustment`
- `entities`
- `deducted`

Add:

```ts
balance_delta?: number;
adjustment_delta?: number;
entity_deltas?: Record<
  string,
  {
    balance_delta: number;
    adjustment_delta: number;
  }
>;
```

Meaning:

- `balance`, `adjustment`, `entities`
  - final post-deduction state
- `balance_delta`, `adjustment_delta`
  - top-level change on the `customer_entitlement`
- `entity_deltas`
  - sparse per-entity changes

### `RolloverUpdate`

Move `RolloverUpdate` into:

- `server/src/internal/balances/utils/types/rolloverUpdate.ts`

Keep existing final-state fields:

- `balance`
- `usage`
- `entities`

Add:

```ts
cus_ent_id?: string;
balance_delta?: number;
usage_delta?: number;
entity_deltas?: Record<
  string,
  {
    balance_delta: number;
    usage_delta: number;
  }
>;
```

Meaning:

- `balance`, `usage`, `entities`
  - final post-deduction rollover state
- `cus_ent_id`
  - parent `customer_entitlement`
- `balance_delta`, `usage_delta`
  - top-level rollover changes
- `entity_deltas`
  - sparse per-entity rollover changes

## Shared Mutation Item Shape

We should treat the normalized `MutationItem` shape as the common bridge between:

- deduction results
- lock receipt `items`
- future mutation log `items`

Conceptual shape:

```ts
type MutationItem = {
  target_type: "customer_entitlement" | "rollover";
  customer_entitlement_id: string | null;
  rollover_id: string | null;
  entity_id: string | null;
  balance_delta: number;
  adjustment_delta: number;
  usage_delta: number;
};
```

Lua conversion helpers should live in:

- `server/src/_luaScriptsV2/deduction/mutationItemUtils.lua`

Functions:

- `deduction_update_to_mutation_items(...)`
- `rollover_update_to_mutation_items(...)`
- `deduction_results_to_mutation_items(...)`

These functions should be used by:

- lock receipt creation now
- mutation log creation later

## Redis / Lua Path

The Redis Lua path should populate delta fields at write time.

### Core rule

Record deltas when we queue the write.

Do not reconstruct deltas later from final balances or final `entities` blobs.

### Main balance path

`queue_balance_update(...)` should:

1. queue the `JSON.NUMINCRBY` writes
2. update additive delta fields on the relevant `customer_entitlement`

Recommended in-memory context additions on `context.customer_entitlements[ent_id]`:

- `balance_delta`
- `adjustment_delta`
- `entity_deltas`

### Rollover path

`queue_rollover_update(...)` should:

1. queue the `balance` and `usage` writes
2. update additive delta fields on the relevant rollover

Recommended in-memory context additions on `context.rollovers[rollover_id]`:

- `cus_ent_id`
- `balance_delta`
- `usage_delta`
- `entity_deltas`

### Final Lua return value

When `deductFromCustomerEntitlements.lua` builds `updates` and `rollover_updates`, it should include:

- existing final-state fields
- the new delta fields

That keeps the return payload backward-compatible while making it rich enough for lock receipts and later mutation logs.

## Postgres / SQL Path

The Postgres deduction path should return the same conceptual shape as the Lua path.

Primary target:

- `server/src/internal/balances/utils/sql/performDeduction.sql`

### Required customer entitlement fields

For each `customer_entitlement`, SQL should return:

- `balance`
- `additional_balance`
- `adjustment`
- `entities`
- `deducted`
- `balance_delta`
- `adjustment_delta`
- `entity_deltas`

### Required rollover fields

For each rollover, SQL should return:

- `cus_ent_id`
- `balance`
- `usage`
- `entities`
- `balance_delta`
- `usage_delta`
- `entity_deltas`

### SQL computation rule

Just like the Lua path, SQL should compute these deltas during the deduction process.

It should not try to infer them afterward by diffing final snapshots.

That means `performDeduction.sql` and any helper SQL it uses should explicitly track:

- top-level `customer_entitlement` balance changes
- top-level adjustment changes
- per-entity balance / adjustment changes
- rollover balance / usage changes
- per-entity rollover balance / usage changes

## Compatibility

Existing snapshot-based consumers should keep working without reading the new delta fields.

This includes:

- `applyDeductionUpdateToFullCustomer`
- `applyRolloverUpdatesToFullCustomer`
- cache sync helpers
- logging helpers
- allocated invoice flows

Compatibility rule:

- current final-state fields remain authoritative for existing behavior
- new delta fields are additive only

## Test Cases

- Top-level deduction returns final `balance` plus `balance_delta`.
- Entity-scoped deduction returns final `entities` plus sparse `entity_deltas`.
- Granted-balance changes return matching `adjustment_delta`.
- Rollover deduction returns final `balance` / `usage` plus `balance_delta` / `usage_delta`.
- Entity-scoped rollover deduction returns sparse rollover `entity_deltas`.
- `deduction_results_to_mutation_items(...)` produces the expected flat `items` array from mixed updates and rollover updates.
- Reserve receipt creation can consume the same mutation item shape.
- Existing snapshot-based consumers continue to work while ignoring the new delta fields.
- Redis Lua and Postgres SQL paths converge on the same conceptual result shape.

## Assumptions

- This document covers deduction result shapes only, not full receipt persistence or finalize logic.
- Delta fields are additive and optional.
- Existing final-state fields must not change meaning.
- `MutationItem` is the shared intermediate format for:
  - lock receipt items now
  - mutation log items later
