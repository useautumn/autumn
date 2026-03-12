# Check Reserve Plan

## Summary

Extend `balances.check` with an explicit reservation mode that:

- reserves credits instead of only doing today's `send_event: true` deduction,
- preserves the exact deduction provenance so later release/refund goes back to the same buckets,
- survives Redis cache eviction before Postgres sync,
- lets callers control reservation expiry with `expires_at`.

This plan is requirements-first. It captures the current codebase behavior, the schema direction discussed so far, and the engineering constraints we need to solve before implementation.

## Current Behavior In The Codebase

### `balances.check` tracked path today

- `server/src/internal/api/check/handleCheck.ts`
  - `send_event: true` routes into `runCheckWithTrack`
- `server/src/internal/api/check/runCheckWithTrack.ts`
  - turns check into a track-style deduction with `overage_behavior: "reject"`
- `server/src/internal/balances/track/runTrackV2.ts`
  - loads `FullCustomer` from cache or DB through `getOrCreateCachedFullCustomer`
  - then executes the Redis fast path via `runRedisTrack`
- `server/src/internal/balances/track/utils/runRedisTrack.ts`
  - calls `executeRedisDeduction`
  - on success, only queues async sync/event work afterward
- `server/src/internal/balances/utils/deduction/executeRedisDeduction.ts`
  - prepares deduction inputs
  - calls Redis Lua `deductFromCustomerEntitlements`

### Deduction order today

Deduction order is determined before Lua in:

- `server/src/internal/balances/utils/deduction/prepareFeatureDeduction.ts`
- `shared/utils/cusUtils/fullCusUtils/fullCustomerToCustomerEntitlements.ts`
- `shared/utils/cusEntUtils/sortCusEntsForDeduction.ts`

Current order:

1. rollovers first, oldest `expires_at` first
2. sorted `customer_entitlements`
3. Lua pass 1 deducts to `0`
4. Lua pass 2 allows negative balances only where `usage_allowed` is true

This means time-bounded balances like hourly/monthly can be consumed before lifetime balances, depending on the sorted entitlement order.

### Refund behavior today

Refunds currently do not replay the original deduction provenance.

In `server/src/_luaScriptsV2/deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua`:

- negative amounts are treated as refunds,
- pass 1 refills toward `0`,
- pass 2 can refill balances up to `max_balance`.

The system does not persist a durable receipt of exactly which rollover / `customer_entitlement` / entity balance was consumed in the original deduction. That is the root cause of the current bucket-drift issue.

### Durability path today

Durability is async and cache-based:

- `server/src/internal/balances/utils/sync/SyncBatchingManagerV2.ts`
  - batches modified `customer_entitlement` IDs / rollover IDs
  - queues `SyncBalanceBatchV3`
- queue worker calls `server/src/internal/balances/utils/sync/syncItemV3.ts`
- `syncItemV3` re-reads the cached `FullCustomer`
- it then calls `sync_balances_v2(...)` to write current cache state to Postgres

### Resiliency problem today

`server/src/external/stripe/webhookMiddlewares/stripeWebhookRefreshMiddleware.ts` can clear the cached customer after webhook handling.

That creates a failure window:

1. Redis deduction succeeds
2. async sync job is queued
3. cache is deleted before `syncItemV3` runs
4. `syncItemV3` sees cache miss and skips
5. Postgres never sees the deduction
6. a later refund/release can add credits on top of stale Postgres state

This is why reserve cannot rely on Redis mutation plus best-effort later balance sync alone.

## Problem Statement

We need a new reservation-backed check flow that fixes three issues:

### A. Exact release correctness

If a customer has multiple balances for the same feature, for example hourly + monthly + lifetime, reserve must later release/refund back into the exact buckets that were consumed.

We cannot continue using a generic refund order that loses provenance.

### B. Resiliency against cache loss

A successful reservation must remain correct even if Redis cache is evicted before the async sync pipeline persists updated balances to Postgres.

We need durability for the reservation itself without turning `balances.check` into a slow synchronous balance-sync request.

### C. Caller-controlled expiry

Reserve needs an `expires_at` field so the caller controls how long the reservation stays held before automatic release.

## API Direction

### `balances.check` request

Add a new `reserve` field:

```ts
reserve: {
  enabled: X,
  key: X,
  expires_at: X,
}
```

Current intent of the fields:

- `enabled`
  - marks the request as a reserve flow instead of plain `send_event`
- `key`
  - identifies the reservation so later operations can refer to it
- `expires_at`
  - absolute release deadline; if the reservation is not finalized before this time it must be automatically released

Notes:

- this shape is the current draft, not the final contract
- whether `enabled` is necessary is still open
- whether `key` is caller-provided, server-generated, or both is still open

### Follow-up endpoint

Add a new follow-up endpoint in the balances family.

Current placeholder name:

- `autumn.balances.confirm`

Name is still TBD. Candidate directions to revisit later:

- `balances.confirm`
- `balances.settle`
- `balances.finalize`

### Follow-up request draft

Current draft input:

```ts
{
  key: X,
  refund: X,
  final_value: X,
}
```

Current intent:

- `key`
  - the reservation to operate on
- `refund`
  - amount to release back from the originally reserved value
- `final_value`
  - alternative to `refund`; specifies the final usage value to keep, overwriting the original reserved amount

Still unresolved:

- whether `refund` and `final_value` should both exist
- if both exist, whether they must be mutually exclusive
- what the default behavior is when neither is sent
- whether the endpoint is semantically "confirm" or "settle"

## Functional Requirements

### 1. Reservation provenance

- A successful reserve check must persist enough information to reconstruct the exact deduction path.
- Provenance must capture the exact:
  - rollover rows used
  - `customer_entitlement` rows used
  - entity-scoped balance paths used
  - deducted amount per bucket
- Later release/refund must use this stored provenance instead of rerunning generic negative-value deduction logic.

### 2. Reservation lifecycle

- reserve creates a held deduction
- follow-up endpoint finalizes the reservation into the final consumed amount
- any excess from the original reserve is released using stored provenance
- reservations expire automatically at `expires_at` if not finalized in time
- expired reservations become non-finalizable

### 3. Idempotency

- reserve must be safe to retry for the same logical reservation
- finalize/confirm must be idempotent
- release on expiry must be idempotent
- duplicate finalize or release must not double-deduct or double-refund

### 4. Durability and resiliency

- a reservation cannot exist only inside a transient Redis cache mutation
- reservation state must survive:
  - full-customer cache eviction
  - Stripe webhook refresh
  - queue delay
  - queue enqueue failure
  - worker retry or replay
- the low-latency reserve path must not wait for full Redis-to-Postgres balance sync inside the request

### 5. Compatibility

- plain `balances.check` remains read-only
- existing `send_event: true` behavior remains backward compatible while reserve is introduced
- reserve is additive, not yet a silent redefinition of `send_event`

## Acceptance Scenarios

- reserve against hourly + lifetime balances, then finalize with a reduced final amount: released credits go back to the exact original buckets
- reserve consumes rollover balance, then release: the same rollover is restored
- reserve on entity-scoped balances, then release: the same entity-scoped balance is restored
- reserve succeeds in Redis, cache is evicted before async balance sync, then later finalize/release still behaves correctly
- duplicate finalize does not double-apply
- duplicate expiry release does not double-refund
- expired reservation cannot be finalized
- insufficient balance returns `allowed: false` and creates no reservation

## Implementation Constraints

- `balances.check` with reserve is expected to stay very low latency
- we cannot require inline Redis track + Postgres sync in the same request
- resiliency must come from a smarter reservation design, not from making the hot path synchronous
- any eventual background reconcile flow must be replay-safe

## Open Decisions

- final name of the follow-up endpoint
- final meaning of reservation `key`
- whether `reserve.enabled` stays
- whether `refund` and `final_value` both exist
- whether the follow-up endpoint is a pure confirm action or a broader settle/finalize action
- exact response schema for successful reserve and successful finalize

## Next Planning Pass

The next pass should narrow Requirement A only:

- finalize the reserve request schema
- finalize the follow-up endpoint name and semantics
- lock the reservation state machine
- define response shapes for reserve and finalize
