# Pooled balance sync correctness

## Status

Deferred. This functionality must return before pooled balances are production-ready.

## Required outcome

Prevent an older Redis balance snapshot from overwriting newer pooled state in Postgres.

Redis can contain usage deductions not yet flushed to Postgres, while pooled billing directly changes Postgres grants and balances. Those sources need a serialized handoff.

## Race to prevent

1. Redis contains the latest usage-adjusted balance.
2. A sync worker reads it and pauses before writing Postgres.
3. Pooled billing writes a newer grant/balance to Postgres.
4. The delayed worker writes its older snapshot.
5. The pooled transition is lost.

Structural cache invalidation has the related risk of deleting Redis-only usage before it is flushed.

## withCustomerBalanceSyncLock

### Purpose

Serialize operations transferring or reconciling Redis/Postgres balance state for one customer.

### Reference behavior

The helper:

1. opened a Postgres transaction;
2. resolved canonical internal customer ID when necessary;
3. built a lock key from organization, environment, and internal customer ID;
4. acquired a transaction-scoped Postgres advisory lock;
5. ran the callback with that transaction handle;
6. committed or rolled back;
7. released the lock when the transaction ended.

It used a local ten-second timeout so unexpectedly long holders failed rather than waiting indefinitely.

### Invariant

Acquire the lock before reading a Redis snapshot and hold it until the related Postgres write completes. Locking only the write permits Redis to change between read and lock acquisition.

It protects against:

- delayed Redis-to-Postgres sync overwriting pooled rebalance;
- concurrent structural transitions using different snapshots;
- invalidation deleting Redis-only deductions during persistence;
- resets, billing transitions, and balance flushes interleaving.

Scope is organization, environment, and internal customer. Different customers remain concurrent.

## balanceSyncDb

balanceSyncDb was the transaction handle from an already-acquired customer balance-sync lock, not another database.

It allowed nested work to reuse the outer transaction instead of:

- opening another transaction;
- acquiring the same advisory lock again;
- waiting on itself;
- committing independently.

When supplied, inner work had to use it for every related Postgres read/write, leave transaction ownership to the caller, and return post-commit cache work to the outer owner.

The billing rework should not carry this parameter through every helper. Prefer one top-level balance-transition boundary. Before deleting the concept, confirm resets, invalidation, webhooks, and license transitions never enter pooled execution while already holding the same lock.

## Post-commit cache cutover

### Purpose

Make Redis reflect a committed pooled transition without losing usage arriving concurrently.

Redis cannot join a Postgres transaction. Mutating it before commit can expose state that later rolls back, so cache mutation happens only after Postgres succeeds.

### Precise optimistic strategy

Inside the transaction, prepare a cutover result containing:

- customer and affected feature IDs;
- rebalanced subject view;
- balance/adjustment deltas by customer entitlement;
- expected subject-view epoch;
- relevant statuses and deduction order.

After commit:

1. Read live Redis balances for affected features from the primary.
2. Combine live values with committed grant effects.
3. Recompute distribution against live usage.
4. Send all affected updates to one atomic Redis operation.
5. Check expected subject epoch and expected balances.
6. If they match, apply deltas atomically and refresh TTLs.
7. Flush resulting Redis balances to Postgres so stores converge.

The epoch prevents applying effects to a structurally different customer view. Expected values prevent overwriting deductions made after the original read.

### Conflict or cache-miss fallback

On epoch change, balance change, missing Redis data, or atomic-write failure:

1. Atomically capture and delete the customer’s shared Redis balance fields.
2. Compare captured cache_version values with current customer entitlements.
3. Discard stale snapshots.
4. Flush valid non-source balances and usage windows to Postgres.
5. Exclude pooled source entitlements because synthetic pools own their spendable grants.
6. Reload pool graphs/contributions from Postgres.
7. Reconcile grants with captured live usage.
8. Persist reconciled state.
9. Invalidate subject cache so the next read rebuilds from converged Postgres.

Plain cache deletion is unsafe: it can discard deductions not yet in Postgres and restore spent credits on rebuild.

### Simpler acceptable first strategy

A slower initial implementation is acceptable:

1. Acquire the customer balance-sync lock.
2. Atomically capture/delete relevant Redis balance fields.
3. Flush valid Redis-only balances and usage windows.
4. Apply pooled lifecycle/rebalance in the same Postgres transaction.
5. Commit.
6. Invalidate subject cache.
7. Rebuild Redis from Postgres on next read.

It must honor cache versions and never flush a pooled source row’s zero/stale balance over synthetic pool state.

## Required boundary

1. Acquire per-customer balance-sync lock.
2. Capture/flush Redis-only state required by the strategy.
3. In one Postgres transaction, apply related product, source, contribution, pool, and rebalance writes.
4. Commit Postgres.
5. Apply post-commit cutover or invalidate for rebuild.

## Acceptance criteria

- A Redis snapshot read before a pooled transition cannot overwrite it afterward.
- A deduction arriving during transition is neither lost nor applied twice.
- Failed Postgres transaction exposes no uncommitted Redis state.
- Cache conflicts reconcile/invalidate instead of blindly applying stale deltas.
- Cache deletion never drops Redis-only usage.
- Different customers remain concurrent.
- Nested callers correctly reuse the locked transaction or are removed.

## Tests

- delayed Redis sync versus contribution update;
- concurrent deduction versus pooled attach;
- concurrent deduction versus source removal;
- subject epoch change between commit and cutover;
- cache-version mismatch during reconciliation;
- Redis cache miss during cutover;
- Redis write failure after Postgres commit;
- Postgres rollback leaves Redis unchanged;
- nested operation does not reacquire its own lock;
- two customers do not block each other.
