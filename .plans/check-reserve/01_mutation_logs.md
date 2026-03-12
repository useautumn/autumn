# Mutation Logs

## Summary

The first step in the reserve work is to move balance persistence from snapshot sync to mutation log replay.

Today, our fast path is:

1. deduct from Redis
2. queue sync to Postgres
3. sync worker re-reads cached `FullCustomer`
4. worker writes current snapshot state to Postgres

This breaks when the cached `FullCustomer` is deleted before the sync worker runs. In that case, the sync job sees a cache miss and skips, which means Postgres never sees the deduction.

To make reserve resilient, we should stop depending on replaying the cached snapshot and instead replay durable mutation receipts.

## Current Problem

Today, `track` and `check(send_event: true)` behave like this:

1. Redis deduction succeeds
2. `SyncBatchingManagerV2` queues a sync job
3. `syncItemV3` later re-reads the cached customer
4. the worker writes the resulting balances to Postgres

Failure case we are solving first:

- the cached `FullCustomer` is deleted before `syncItemV3` runs
- `syncItemV3` sees a cache miss and skips
- the deduction is lost from Postgres
- later refund/release can over-credit the customer

This step is only focused on the cache-miss branch of sync failure.

## Proposed Direction

We will replace snapshot sync with mutation log replay.

Instead of making the sync worker reconstruct the latest balances from cached `FullCustomer`, each successful deduction will append a compact mutation receipt to Redis.

The sync worker will then:

1. read pending mutation receipts
2. batch them together
3. apply the aggregated deltas to Postgres
4. mark those mutation receipts as processed

This makes sync independent from the `FullCustomer` cache blob.

## Why Mutation Logs

Mutation logs are a better fit than snapshot sync because:

- they survive deletion of the cached `FullCustomer` if stored separately
- they preserve the exact balance changes caused by each deduction
- they allow batching many writes together before touching Postgres
- they compose better under retries than absolute snapshot overwrites

The core design goal is:

- Redis remains the low-latency write path
- Postgres is updated by replaying ordered mutation deltas, not by reading a later cache snapshot

## Redis Structure

We should use Redis Streams for mutation logs.

We should not store receipts inside a giant JSON array on the cached customer object.

Why Streams:

- append-only log
- monotonic entry IDs
- natural batch cutoffs by stream ID
- better fit for high write concurrency than rewriting one large array value

Recommended logical model:

- one mutation stream per hot sync unit
- initial assumption: per customer
- possible future sharding: per customer + feature if a single customer becomes too hot

Example logical key:

- `balance_mutations:{org_id}:{env}:{customer_id}`

Each stream entry should contain compact identifiers and deltas, not snapshots.

Streams also remove the need for "atomic rotate" style queue draining.

With lists or string-backed pending keys, the worker would need to atomically rename a `pending` key into an `inflight` key to get a stable batch. With streams, the stable batch boundary comes from stream IDs instead:

- worker captures the current max stream ID
- worker processes only entries `<= cutoff_id`
- new writes get larger IDs automatically
- those writes are deferred to the next batch

This is the stream equivalent of taking a consistent snapshot of the pending work without freezing new writes.

## Mutation Receipt Shape

Each receipt should record the exact balance changes produced by one successful operation.

Use identifier-based deltas, not Redis JSON paths, as the canonical format.

Each receipt should be able to represent changes to:

- `customer_entitlements`
- rollovers
- entity-scoped balances

Example logical payload:

```json
{
  "mutation_id": "mut_123",
  "customer_id": "cus_123",
  "feature_id": "feat_123",
  "source": "track",
  "items": [
    {
      "target_type": "customer_entitlement",
      "customer_entitlement_id": "ce_1",
      "entity_id": null,
      "balance_delta": -4,
      "adjustment_delta": 0
    },
    {
      "target_type": "rollover",
      "rollover_id": "ro_1",
      "customer_entitlement_id": "ce_2",
      "entity_id": null,
      "balance_delta": -6,
      "usage_delta": 6
    }
  ]
}
```

The mutation log should store deltas only:

- not full cached balance objects
- not the entire `FullCustomer`
- not a copy of the snapshot sync payload

The `mutation_id` is required for replay safety. It is not optional bookkeeping.

Even if the same Redis stream entry is observed multiple times due to retry, we must be able to prove in Postgres whether that mutation has already been applied.

## Sync Worker Model

The worker should stop doing cache-snapshot sync for the reserve path.

Instead, for each customer:

1. acquire a per-customer sync lock
2. capture a stream cutoff ID
3. read all mutation receipts up to that cutoff
4. try to register each `mutation_id` inside Postgres in the same transaction as the balance apply
5. fold only the not-yet-applied mutations into one aggregated Postgres operation
6. apply the aggregated deltas to Postgres
6. mark those mutations as processed
7. trim or delete processed stream entries later

This gives us batching without requiring the `FullCustomer` cache to still exist.

The dedupe insert and the balance updates must happen in the same Postgres transaction.

If they do not, we can end up with one of two bad states:

- mutation recorded as applied, but balance updates never committed
- balance updates committed, but mutation not recorded as applied

Both cases break replay safety.

## Postgres Replay Model

Replay safety is handled in Postgres, not only in Redis.

We should introduce a small dedupe table for applied mutations. Example logical shape:

- `applied_balance_mutations`
  - `mutation_id`
  - `org_id`
  - `env`
  - `customer_id`
  - `applied_at`

The unique key should be based on mutation identity, for example:

- `unique(org_id, env, mutation_id)`

Worker apply flow:

1. start a Postgres transaction
2. insert the batch's `mutation_id`s with `ON CONFLICT DO NOTHING`
3. determine which mutation IDs were newly inserted
4. fold only those newly inserted mutations into deltas
5. apply the folded deltas to balances
6. commit

This makes duplicate replay harmless:

- first replay inserts the mutation ID and applies the delta
- later replay sees the duplicate mutation ID and skips that mutation

We should dedupe per mutation, not only per batch.

Batch-level dedupe is not enough because:

- batch composition can change on retry
- one mutation may already be applied while others are not
- per-mutation dedupe is what preserves correctness under partial failure

## Race Conditions To Guard Against

### 1. Write happens during sync

A new deduction can happen while the worker is draining the mutation log.

We must not lose that write and must not partially include it in the current batch.

Streams solve this by using a cutoff ID:

- worker captures the current max stream ID
- worker processes only entries up to that ID
- new writes get higher IDs
- those writes stay for the next batch

This is the stream equivalent of getting a stable batch boundary.

### 2. Two workers sync the same customer

If two workers drain the same customer at once, the same mutations can be applied twice.

We need a per-customer sync lock, for example:

- `sync_lock:{org_id}:{env}:{customer_id}`

Only one worker can own that customer’s sync batch at a time.

If a worker fails to acquire the lock, that is not a terminal error.

Lock miss means:

- another worker is already syncing that customer
- the pending mutations must remain untouched
- the current worker should retry later or rely on a later sync trigger

Lock miss must never clear or acknowledge pending mutations.

### 3. Worker crashes after Postgres apply but before cleanup

If Postgres is updated but the worker dies before marking mutations as processed, the next worker can replay the same entries.

To make retries safe, Postgres apply must be idempotent per mutation.

That means each mutation needs a stable `mutation_id`, and Postgres needs to remember which mutation IDs have already been applied.

This is why the lock alone is not enough. The lock reduces concurrent replay, but only Postgres idempotency makes crash-retry replay safe.

### 4. Worker cleanup races with new writes

We must not delete or trim entries that were appended after the worker’s batch cutoff.

The worker should only mark or trim entries that are confirmed part of the applied batch.

### 5. Mutation log is replayed twice

The same mutation can be replayed twice even if the lock works correctly.

Examples:

- worker A applies to Postgres, then crashes before stream cleanup
- worker B later retries and sees the same stream entries
- the queue redelivers the same work after a transient failure

This is expected behavior. The system should tolerate it.

The protection is:

- stable `mutation_id`
- Postgres dedupe table
- dedupe insert and balance apply in one transaction

### 6. Very high throughput on a single customer

If one customer becomes extremely hot, one stream can become a hotspot.

Initial plan:

- start with one stream per customer
- keep receipts compact
- batch aggressively in the worker
- revisit sharding by customer + feature only if one customer becomes too hot in production

## Throughput Notes

Creating many mutation log entries is acceptable if:

- the entries are compact
- they are append-only
- they are drained continuously
- processed entries are cleaned up

What we should avoid is one giant array value that is constantly rewritten.

The first implementation should optimize for correctness first and high-throughput batching second.

## Entity-Scoped Balance Gotchas

The `customer_entitlements.entities` field is stored as JSONB in Postgres and as nested JSON in Redis.

This does not prevent atomic deductions, but it changes how replay must be implemented.

### Redis side

Entity-scoped deduction is already atomic in Lua today.

The deduction script updates nested entity paths inside the same script execution using Redis JSON path writes. That means entity-scoped balance mutation is already atomic at the Redis level.

### Postgres side

For replay, we should not:

- read the `entities` JSON into app code
- modify it in TypeScript
- write the whole blob back

That would reintroduce lost-update races.

Instead, replay should use SQL updates that derive the new nested value from the current row state, for example with `jsonb_set(...)`.

This is the JSONB equivalent of:

- `balance = balance - 1`

The atomicity comes from:

- row-level locking during `UPDATE`
- computing the new JSONB value inside SQL from the current row contents

This codebase already has working SQL patterns for nested JSONB balance updates in the deduction SQL helpers. The mutation-log replay path should reuse the same style of update.

### Practical implication for receipts

Mutation receipts must capture enough information to replay entity deltas safely:

- `customer_entitlement_id`
- `entity_id`
- `balance_delta`
- `adjustment_delta` when relevant

We should not make Redis JSON paths the canonical replay format. Identifier-based deltas map better onto Postgres row + JSONB update logic.

## Rolling Deploy Bridge

A plain wall-clock cutover timestamp is not safe for this migration.

Why:

- snapshot sync does not replay the state from when the job was queued
- it reads the latest Redis `FullCustomer` state when the worker runs
- an old snapshot job can therefore include newer deductions that happened after the intended cutover point
- replaying those newer mutation logs as well would double-apply them

A safer bridge is to make snapshot sync stream-aware.

### Snapshot checkpoint

When snapshot sync reads the cached customer, it should also atomically capture the current mutation-stream cutoff for that customer.

Conceptually, snapshot sync should obtain:

- `full_customer_snapshot`
- `snapshot_stream_cutoff_id`

These two values must be read together atomically from Redis so the snapshot and cutoff refer to the same point in time.

Meaning of `snapshot_stream_cutoff_id`:

- the Postgres snapshot already includes all mutation log entries up to this stream ID

### Replay rule

Mutation replay should only apply stream entries with:

- `stream_id > last_snapshot_stream_id`

This avoids replaying mutations that were already covered by the snapshot sync.

### Important constraint

This bridge only works after all writers are dual-writing:

- every Redis deduction must also append a mutation log entry

Otherwise the mutation stream watermark is incomplete and cannot safely define what the snapshot already covers.

### Practical use

This gives us a rolling-deploy migration path where:

1. all writers dual-write Redis balance mutations + mutation logs
2. snapshot sync becomes stream-aware and stores `last_snapshot_stream_id`
3. mutation replay only processes entries after that stored watermark
4. once stable, snapshot sync can be removed entirely

## Scope Of This Step

This step only changes how deductions are persisted to Postgres.

In scope:

- mutation log append on successful deduction
- stream-based worker replay
- batching and race-condition handling for sync
- Postgres idempotency for replay safety
- entity-scoped delta replay through SQL, not app-side blob rewrites

Out of scope for this doc:

- final reserve API shape
- confirm/finalize endpoint naming
- event insertion resiliency
- non-cache-miss sync conflict handling
- full reservation lifecycle semantics

## Acceptance Criteria

- sync no longer depends on the cached `FullCustomer` snapshot for reserve-backed deductions
- deleting the cached customer before the worker runs does not lose the deduction
- concurrent writes during sync are not lost
- concurrent workers do not double-apply the same mutations
- retries after worker failure do not double-apply Postgres changes
- many mutations for the same customer can be folded into one Postgres sync operation
