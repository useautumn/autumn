# Decisions

One question at a time. Each entry: the question, what we chose, why, and what it costs.

## 1. Where the lock lives, and how finalize finds the customer

**Chosen: a Postgres row, written by the committer. Finalize does one indexed read on the primary.**

```
lock      decide -> one Kafka record -> one PG transaction
            balance increments + INSERT lock row
finalize  server: SELECT customer by (org_id, env, lock_id)     one row, primary
          worker: decide -> one Kafka record -> one PG transaction
            balance increments + DELETE lock row
```

Why the read is safe: the lock reply is only sent after the Postgres commit, so a finalize that follows it always finds the row on the primary. A replica could lag, so this read must not go to one.

**DynamoDB, considered and rejected as the home of the lock.**

| | Postgres row | DynamoDB item |
|---|---|---|
| lock row and balance change commit together | yes, same transaction | no, two stores |
| crash between the two writes | cannot happen | deduction with no lock, or lock with no deduction |
| exactly-once finalize | the single partition writer plus the row's presence | needs a conditional delete **and** a way to tie it to the balance commit |
| cleanup | delete at finalize, sweep after 24h | native TTL, free |
| lookup speed | one indexed row, low single-digit ms | similar from the server |

The whole gain of this design is that the lock and the balance move in one transaction. Putting the lock in a second store brings back the exact hole today's Postgres fallback has. Dynamo's real advantage is free TTL cleanup, and a 24 hour sweep on a small table covers that.

Dynamo as a pure routing index (lock id to customer) would be safe, but it duplicates a unique index Postgres needs anyway for question 2, and it is not faster than one indexed row read.

Cost: one extra Postgres read per finalize, on the server, on the primary.

## 2 and 3. Duplicate lock ids, and what lives in memory

**Settled: open lock ids live in the customer's in-memory state, as a cache of Postgres. The full lock row lives only in Postgres.**

```
Postgres    balance_locks: id, lock_id, customer, deltas, properties, expiry   the truth
memory      per customer: the set of open lock ids, about 40 bytes each        a cache
```

Why this one. `decide` runs one command at a time per partition, and it updates the id set in the same step as the deduction. So the check and the deduction are one uninterruptible step:

```
decide(lock L1)                         decide(finalize L1)
  L1 in open ids?  yes -> error, stop     L1 in open ids?  no -> "Lock not found"
  deduct                                  undo the deduction
  add L1                                  remove L1
```

Then one Kafka record and one Postgres transaction carry the balance change and the lock row insert or delete together.

After a restart nothing is loaded up front. The ids come back lazily with the customer, as one more line in the existing customer load: `SELECT lock_id FROM balance_locks WHERE customer = A`. A lock reaches Postgres before the caller is told about it, and a worker that died between Kafka and Postgres is covered by the existing replay-before-serve recovery.

At finalize the server already reads the lock row to find the customer (decision 1), so it sends the row's deltas along with the command. A lock row is never edited after creation, so that copy cannot be stale. Memory never needs the deltas.

Same-customer races, all closed by the writer's existing serialisation:

| race | outcome |
|---|---|
| two locks, same id, same instant | second sees the id, errors before deducting |
| two finalizes at once | second finds the id gone |
| finalize racing expiry | expiry is a release command, first to decide wins |
| finalize before the lock committed | server finds no row yet, "Lock not found" |
| two requests both load the customer | load is single-flight |
| customer evicted mid-commit | evict waits for in-flight commits |

Rejected along the way, and why:

| option | why not |
|---|---|
| gate in the flush (`ON CONFLICT DO NOTHING`, balance change conditional) | memory has already applied the losing deduction, so a later track can be wrongly refused |
| claim the id in Postgres before deciding | `claimed` versus `held`, dead claims after a crash, cleanup on refusal, a round trip on every lock |
| Postgres only, with a per-customer lane | works and is atomic, but adds a queue, a read per lock and waiting under contention, all to avoid a small id cache |

Still to decide under this heading: a cap on open locks per customer.

**Not handled, by choice:** the same `lock_id` on two different customers. They are on different partitions so memory cannot see it. Production, 7 days: about 600 duplicate-lock 409s against about 3 million locks, 0.02%, and nearly all of those are same-customer retries. Left as is.

**Pre-existing weakness this inherits:** a customer load already in flight when an evict lands can put old rows back. Affects balances today, would affect lock ids the same way. Worth fixing on its own.

## 4. Expiry

**Settled: EventBridge for caller-supplied expiries, exactly as today. A sweep loop covers everything else and backs EventBridge up.**

```
every lock row has expires_at           caller's value, else now + 24h
caller sent expires_at  -> EventBridge one-shot schedule, as today
                           fires -> SQS -> expireLock -> finalize(release) through the worker
sweep loop              -> any row still present past expires_at + grace
                           no-expiry locks at 24h, and any lock whose schedule failed or never fired
```

Expiry racing a confirm is already covered: both are commands on the same customer, the first to decide wins, the other gets "Lock not found", which `expireLock` already swallows (`server/src/internal/balances/finalizeLock/expireLock.ts:13`).

EventBridge has room. Account quotas in us-east-2: create 5,000/s, delete 1,000/s, fire 1,000/s, 10M schedules. Measured lock traffic peaks near 37/s, and only 119 expiries fired in 7 days. Delete is the tightest, at about 27 times today's peak.

What the sweep does to a due lock depends on why it is due, so the row records it:

| row | `expiry_action` | why |
|---|---|---|
| caller sent `expires_at` | `release` | the schedule should have released it, the sweep is the backup |
| no `expires_at` | `confirm` | today the 24h Redis TTL drops the receipt and the deduction stays |

### The sweep: requirements

The precedent is `server/src/cron/resetCron/runResetLoop.ts`, a self-pacing loop, **not** a `CronJob` tick. A per-minute tick can overlap itself when a run takes longer than a minute. The loop cannot.

```
runLockSweepLoop            while (!signal.aborted): gate -> one batch -> wait
  runLockSweepBatch         fetch due rows -> finalize each -> report counts
    getDueLocks             one keyset query, statement timeout
    finalizeDueLock         finalize through the worker, its own timeout
```

| requirement | how |
|---|---|
| no overlapping loop | one `while` loop, the next batch starts only after the last resolves. One loop per process, and the blue-green slot gate keeps one cron task active. If two ever ran, finalize is exactly-once, so the second gets "Lock not found" |
| proper timeouts | statement timeout on the fetch. Each finalize bounded by the worker client timeout. A deadline on the whole batch via `AbortSignal`. Shutdown aborts the wait, as the reset loop does |
| one bad lock cannot starve the rest | keyset cursor on `(expires_at, id)` advances past failures within a pass. The failed row stays and is retried on a later pass |
| scales with abandoned locks, not throughput | finalize deletes the row, so the sweep only ever finds abandoned locks. 119 a week today |
| bounded load on the worker | fixed concurrency for the finalize calls in a batch |
| adaptive pacing | full batch -> short delay, otherwise idle delay, as the reset loop does |
| kill switch | an edge config flag, as `isResetJobEnabled` |

Index risk to benchmark on staging before shipping: every lock adds an `expires_at` index entry and finalize removes it, so dead entries collect at the old end, where the sweep reads. The grace period and an aggressive autovacuum setting on this small table are the mitigation. EXPLAIN it, do not assume.

Noted, not chosen: the same sweep could replace EventBridge outright. EventBridge is accurate to about a minute and costs a create and a delete call per lock.

## 5. The refund rules to port

**Settled: finalize produces deltas, exactly like a track does. Nothing downstream changes.**

The engine's unit is already `deltas -> row changes` (`deltasToRowChanges`, `packages/balance-engine/src/deduction/utils/convertDeductionUtils.ts:135`). A track gets its deltas from `deduct`. A finalize gets them from two places and concatenates:

```
finalize(lock, finalValue f)                 L = sum of the lock's value deltas

 1 split      { unwindValue, additionalValue } = splitFinalize(L, f)
 2 unwind     walk the lock's deltas BACKWARDS, emit the inverse of each
              until unwindValue is used up. A delta whose row is gone is skipped.
 3 forward    deduct( additionalValue - lockSign * skipped )
              run with the unwind deltas already in its state, so it sees
              post-unwind balances. The LOCK's overage behaviour applies.
 4 changes    deltasToRowChanges( unwind deltas + forward deltas )
              + delete the lock row
```

Step 1 is an existing pure function to port (`server/src/internal/balances/utils/lock/unwindLockUtils.ts:8`):

| case | unwindValue | additionalValue |
|---|---|---|
| `L == 0` | 0 | f |
| `f == 0`, release or expiry | abs(L) | 0 |
| signs differ | abs(L) | f |
| abs(f) >= abs(L) | 0 | f - L |
| abs(f) < abs(L) | abs(L) - abs(f) | 0 |

`f == L` falls out as 0 and 0: no balance change and no event, only the lock row is deleted.

Why inverse deltas and not a negative `deduct`: refunds through `deduct` skip rollovers and clamp at the included allowance (`deductFromBucket.ts:24`, `resolveRowBounds.ts:135`). The legacy unwind is deliberately unclamped. Increments are an exact inverse.

Each legacy rule, and where it lands:

| rule | how | cost |
|---|---|---|
| newest bucket first | iterate the lock's deltas in reverse | free |
| partial unwind of one bucket | scale that delta by `units / abs(valueDelta)` | small |
| entity balances | `entityKey` is already on every delta | free |
| rollovers, with their `usage` | delta `table: rollovers` carries `usageDelta` | free |
| credit systems, fixed rate | `creditCost` is on every delta | free |
| bucket vanished after an upgrade | row not in state -> skip, fold into the forward amount | small |
| confirm above the lock | the existing `deduct`, seeded with the unwind deltas | small |
| the lock's overage behaviour governs | stored on the lock row, passed to `deduct` | free |
| negative locks, sign flips | fall out of the split table | free |
| no clamp at the allowance on refund | increments are unclamped | free |
| allocated and boolean features rejected | guard in the lock decision | small |
| usage windows shrink on refund | needs the windows the lock counted in | **later unit** |
| graduated credits reprice the marginal tail | `unwindLockV2.lua:42`, its own algorithm | **last unit** |
| overdue block on a confirm above the lock | `enforceOverdueBlock` on the forward deduct | later unit |

Found while reading, bigger than locks: **the worker track path records no usage events.** `runBalanceWorkerTrack` and `handleTrack`'s worker branch never insert one. The lock tests assert events at lock time (value L) and at finalize (value `f - L`, the lock's properties unless overridden, nothing when `f == L`). Events need their own decision before those assertions can pass.

Local testing: `bun dw` runs fakecloud, use it for the EventBridge schedule in the expiry unit.
