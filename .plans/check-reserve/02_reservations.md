# Reservations

## Summary

This phase adds reservation-backed check and finalize flows without taking on mutation-log sync yet.

We will keep the current sync model for now. Reservation correctness comes from storing a reservation receipt in Redis at deduction time, using the same atomic flow as the Redis deduction itself. Finalize then reads that receipt and either confirms the reservation or releases it by replaying the stored provenance, not by using the generic refund order.

Automatic expiry is intentionally left to the end. This phase defines the receipt and expiry index shape so the sweeper can be added later without revisiting the reserve data model.

## API Changes

### `balances.check`

Add `reserve` to [checkParams.ts](/Users/johnyeocx/.superset/worktrees/autumn-main/reserve-and-confirm/shared/api/balances/check/checkParams.ts):

```ts
reserve: {
  enabled: true,
  key?: string,
  expires_at?: string,
}
```

Behavior:

- if `reserve.enabled` is false or absent, current behavior stays unchanged
- if `reserve.enabled` is true and `reserve.key` is absent, generate a random key server-side
- return the resolved reserve key in the check response when reserve is enabled
- `expires_at` is optional at check time; when present it controls automatic expiry

### `autumn.balances.finalize`

Add a finalize action/handler with body:

```ts
{
  finalize_action: "confirm" | "release",
  overwrite_deduction?: number,
  new_deduction?: number,
  reserve_key: string,
}
```

Chosen defaults:

- `overwrite_deduction` and `new_deduction` are mutually exclusive
- if both are present, reject the request
- if neither is present on `confirm`, keep the full reserved deduction
- `release` ignores deduction override fields and fully releases the reservation

Initial response can stay minimal:

```ts
{ success: true }
```

## Reservation Receipt Model

Store one Redis receipt per reservation under a namespaced key such as:

- `reservation:{org_id}:{env}:{reserve_key}`

The reservation receipt is long-lived workflow state, not a mutation-log entry. It should contain:

- `reserve_key`
- `status: "pending" | "confirmed" | "released" | "expired"`
- `org_id`, `env`, `customer_id`
- `feature_id`
- `entity_id`
- `expires_at`
- request fingerprint fields needed for dedup/conflict detection
- normalized provenance `items` describing the exact deduction performed:
  - `target_type`
  - `customer_entitlement_id`
  - `rollover_id`
  - `entity_id`
  - `balance_delta`
  - `adjustment_delta`
  - `usage_delta`

The `items` shape should deliberately match the future mutation-log delta shape so reservation work is reusable later. The receipt and future mutation log entries are related, but they are not the same object:

- reservation receipt = long-lived business state
- mutation log entry = short-lived durability event

## Shared Reserve Utilities

Add TypeScript reserve utilities under [server/src/internal/balances/reserve](/Users/johnyeocx/.superset/worktrees/autumn-main/reserve-and-confirm/server/src/internal/balances/reserve):

- key builders for reservation keys and expiry index keys
- `updates -> reserve receipt` conversion shared by Redis and Postgres deduction paths
- request fingerprint helpers
- reserve receipt types

Goal:

- Redis and Postgres paths both call the same receipt-building code
- only the persistence mechanism differs

Any Lua-related helpers for reserve should live under `server/src/_luaScriptsV2/reserve`.

## Redis Deduction Path

Extend [executeRedisDeduction.ts](/Users/johnyeocx/.superset/worktrees/autumn-main/reserve-and-confirm/server/src/internal/balances/utils/deduction/executeRedisDeduction.ts) to pass `reserve` into the Lua deduction flow.

Reserve creation requirements inside the deduction Lua path:

- reserve logic runs only after insufficient-balance validation passes
- create/store the reservation receipt before `apply_pending_writes`
- perform duplicate-key detection before mutating balances
- if the reservation key already exists:
  - same fingerprint: treat as idempotent and return the existing reservation result
  - different fingerprint: return conflict/error
- if receipt creation fails, do not apply pending writes

This preserves atomicity:

- deduct + receipt creation happen together
- or neither happens

The Lua reserve helpers should be responsible for:

- reservation key construction
- writing the receipt
- building the normalized receipt items from deduction updates
- later, handling finalize/release state transitions atomically

## Postgres Deduction Path

Extend [executePostgresDeduction.ts](/Users/johnyeocx/.superset/worktrees/autumn-main/reserve-and-confirm/server/src/internal/balances/utils/deduction/executePostgresDeduction.ts) to build and store the same reservation receipt shape from `DeductionUpdate`.

This path should reuse the shared TypeScript receipt-conversion utilities rather than having separate reserve receipt building logic.

The reserve persistence mechanism can differ from Redis internally, but the stored receipt schema should remain the same.

## Finalize Flow

Add the `autumn.balances.finalize` handler/action.

Flow:

1. load the reservation receipt by `reserve_key`
2. validate it exists and is in a valid state
3. ensure cached customer exists via `getOrCreateCachedFullCustomer`
4. invoke an atomic Lua finalize script
5. queue normal sync using the affected `customer_entitlement` and rollover IDs
6. return `{ success: true }`

Finalize semantics:

- `confirm` with no override fields:
  - mark `pending -> confirmed`
  - no balance change
- `confirm` with `overwrite_deduction` or `new_deduction`:
  - compute the compensating release from the original receipt
  - restore exact provenance rather than using generic refund ordering
  - mark `confirmed`
- `release`:
  - fully reverse the original provenance
  - mark `released`

The finalize Lua flow must operate from the stored receipt provenance, not from current deduction ordering.

## Expiry Design

This phase defines expiry storage but leaves the sweeper worker for the end.

At reserve creation time:

- store `expires_at` on the receipt
- add the reservation key to a Redis ZSET such as:
  - `reservation_expiries:{org_id}:{env}`
  - score = `expires_at`

Important rule:

- do not rely on Redis key TTL deletion for expiry
- deleting the receipt would lose the provenance needed to release balances

Later sweeper phase:

- worker polls due keys from the ZSET
- worker runs the same atomic release/expire Lua path
- worker marks the receipt `expired`
- worker queues normal sync

The expiry mechanism should preserve the same atomic state transition guarantees as manual finalize:

- only `pending` reservations can expire
- confirm vs expire races are resolved by Lua atomicity
- one transition wins and the other becomes a no-op

## Tests And Scenarios

- reserve check creates a receipt and deducts balances atomically
- reserve check with no provided key generates a key and returns it
- duplicate reserve key with same fingerprint is idempotent
- duplicate reserve key with different fingerprint returns conflict
- reserve across hourly + lifetime balances stores exact provenance for both buckets
- reserve involving rollovers stores rollover provenance and usage deltas
- reserve involving entity-scoped balances stores entity-specific provenance
- `finalize_action = "confirm"` with no override keeps the full reservation and marks it confirmed
- `confirm` with `overwrite_deduction` or `new_deduction` partially releases only the difference, using stored provenance
- `finalize_action = "release"` fully restores the original buckets and marks the receipt released
- finalize on non-`pending` reservations is idempotent or safely rejected according to the chosen state transition rules
- reserve with `expires_at` writes the expiry index entry
- expiry/release logic reuses stored provenance rather than generic refund ordering
- Redis and Postgres deduction paths produce the same receipt shape from updates

## Assumptions

- this work intentionally keeps current snapshot sync and excludes mutation-log sync changes
- reservation receipts are long-lived business state
- future mutation-log entries may reuse the same normalized `items` shape, but they remain separate objects
- `overwrite_deduction` and `new_deduction` are mutually exclusive
- `confirm` without override fields means "keep the reserved deduction as-is"
- `release` fully reverses the reservation
- the expiry sweeper implementation will be added later, but receipt + ZSET indexing are part of this plan now
