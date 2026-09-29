# Balance worker: commit to Postgres, not SQLite

2026-09-18 · john/one-record · c2c85bef18 · plan, revision 2, not yet approved

Follows `plans/balance-worker-customer-state.md` and `plans/balance-engine-commands.md`.
One change: the durable medium under the `StateStore` port moves from a private SQLite file
to the shared Postgres tables. Kafka stays the ordered log of mutations and the fence. SQLite
stays as a second backend behind a constant, so a revert is a one-line change.
Concurrent Postgres writers are deferred to `plans/balance-worker-concurrent-writers.md`.

## Context

### the write path today
[apps/balance-worker/src/processor/writer/ · state/ · kafka/meteringConsumer/]

```
track ─► ensureSubject (async)          hydrate from PG on miss → initialize mutation
      ─► writer.decide (sync)           readFreshestState = pending projection ?? stateStore.readOwnState
                                        readReceipt (dedup by commandId + fingerprint)
                                        enqueue; projection per subject
      ─► commit (async, batched ≤100)   appender.appendCommitted  (Kafka, fenced txn)
                                        stateStore.applyDurableMutations (SQLite, one txn per batch)
                                          applyRecord: receipt guard · revision guard · progress guard
      ─► reply { result, changes, state }   after the SQLite apply
follower  consumer → applyDurableMutations, position_already_applied when the writer got there first
restart   bootstrap: local progress ∨ S3 checkpoint ∨ log start → replay → ready
```

- `StateStore` owns three tables: `subject_states` (one JSON per subject key), `mutation_receipts`,
  `partition_progress`. Every other module reaches SQLite only through this port.
- `applyDurableMutations` is synchronous; the writer and the follower both call it. The consumer
  handler already accepts a Promise (`TopicRecordHandler.applyRecord`), the writer does not.
- Checkpoints, S3, bootstrap "restore/replace", and standby "prepare" exist because SQLite is
  private to one process. ~24 test files / ~80 cases are coupled to that; they keep running
  under the sqlite backend.
- Hydration reads Postgres once (`getSubjectRows`) and never writes back. Postgres is stale for
  any routed customer for as long as the worker owns it: the dual source of truth.

### what a receipt is for, and what progress is for
[state/repos/mutationReceipts · state/repos/partitionProgress · server/.../balanceWorkerTrackRequest.ts:23]

```
receipt   "have I already applied commandId X, and was it the same request?"
          commandId = ["track", body.idempotency_key]  when the caller sent one
                    = ctx.id                            otherwise, never repeats
          today: SQLite row per mutation, 24h retention, whole mutation JSON,
                 so a warm duplicate replies the original result;
                 also the replay guard in applyRecord (receipt present → duplicate)

progress  "which log offsets are already in the store?"   one row per partition: next_offset
          the writer applies its own batch and advances it; the follower sees position_already_applied
          restart: replay from next_offset to log end, then ready
```

The server already owns the 24h contract. `runTrackWithRollout.ts:36` claims `body.idempotency_key`
in DynamoDB through `withIdempotencyKey` (org-configurable TTL, 24h default) and a duplicate is a
409 `DuplicateIdempotencyKey`, not a replayed response. The key is released on retryable failures
(5xx, non-409 4xx, unknown errors) so the client can retry. The worker route at `handleTrack.ts:40`
bypasses that wrapper today. The worker client never retries on its own (`sendToOwner.ts:30`).

### the rows the worker moves
[packages/balance-engine/src/models/mutation/rowChange.ts · shared/models/.../cusEntTable.ts]

```
changes: RowChange[]     table                  op        columns a track touches
                         customerEntitlements   update    balance · adjustment · usage_attribution
                         rollovers              update    balance · usage
                         usageWindows           insert    whole row (uw_<key>)
                                                update    usage · window_start_at · window_end_at · updated_at
                         customer / entity      insert    baseline only (initialize)
                         customerProducts/Prices insert   baseline only today; attach later
```

`before` on an update is exactly the compare-and-set predicate. Balance columns are
`numeric` read as JS numbers; the engine rounds to 1e-10 between phases.

### volume
10B tracks / month ≈ 3,900 / s average. Anything written once per mutation is written 3,900
times a second; anything written once per batch (≤100) or per partition (512) is not.

## Target model

### Postgres is the materialization, Kafka the log, memory the working copy

```
                     ┌─ writer (per partition) ─────────────────────────────────────┐
 command ──ensure──► │ subject cache: Map<subjectKey, { state, receipts }>, bounded  │
                     │   miss → getSubjectRows → cache put (no log record)          │
                     │ decide (sync): projection ?? cache · receipt in cache         │
                     │ commit: Kafka append (fence) → PG txn → cache put → settle    │
                     └───────────────────────────────┬──────────────────────────────┘
                                                     │ one transaction per batch
                     ┌─ Postgres ────────────────────▼──────────────────────────────┐
                     │ customer_entitlements · rollovers · usage_windows   CAS on before │
                     │ balance_partition_progress (512 rows)              next_offset   │
                     └──────────────────────────────────────────────────────────────┘
```

1. **The reply waits for the Postgres commit**, exactly where it waits for the SQLite apply today.
   Anything a client learned is in Postgres; `customers.list` reads rows, never the worker.
2. **Kafka is the log of truth for recovery.** Append first (the transactional producer is the
   fence), then apply. A crash between the two is replayed from `balance_partition_progress`.
3. **One map in the writer is the working copy, never the truth.** `decide` is synchronous and
   Postgres is not, so the last committed state of a subject must stay in memory between
   commits, or two commands that both read Postgres before the first committed would decide on
   the same balance (the lost-update race). Today that resting copy is SQLite and
   `projectedStateBySubjectKey` is only the in-flight overlay, deleted on commit. After the
   change the same map keeps the entry after commit: a write-back L1 over Postgres.

   ```
   map[subjectKey] → { state, recentCommands }
   filled    fetch on miss (single flight per subject), adopted inside decide only if still empty
   updated   decide (projection), commit (committed state)
   read      decide, check (after waiting for pending commits)
   evicted   over the byte bound, LRU first, skipping any key whose customer is in
             pendingByCustomerKey (a dirty line is never dropped); pending ≤ maxPendingCommands
             so something is always evictable
   ```

   Nothing async ever writes the map; every write is inside the sync `decide` step. `revision`
   lives here only and restarts at 0 per fetch; the log's `before`/`after` are the durable guard.
4. **Receipts are the last N command ids on the map entry.** See Decisions 4.
5. **Progress is the only bookkeeping table.** One row per partition (512), one `UPDATE` per batch
   in the same transaction as the row changes: exactly-once from the log into Postgres.

### The commit: one transaction, row changes as guarded SQL

```
applyDurableMutations(records)                                     postgres backend
  BEGIN
  progress = SELECT next_offset FOR UPDATE; batch offset ≠ progress → position_already_applied
  for each record, in log order
    coalesce: N changes to one row in the batch → one UPDATE (before of first, after of last)
    update → UPDATE t SET <after> WHERE id = $id AND <before…>     rowcount ≠ 1 → StaleSubjectStateError
    insert → INSERT                                                conflict    → StaleSubjectStateError
    delete → DELETE WHERE id = $id                                 rowcount ≠ 1 → StaleSubjectStateError
  UPDATE balance_partition_progress SET next_offset = $after WHERE next_offset = $expected
  COMMIT
  map: put nextState per subject, remember the command ids
```

- Numeric CAS uses the engine's tolerance: `abs(col - $v) < 1e-9`; jsonb columns compare with `=`.
- `SET` and `WHERE` columns come from the worker row schema's keys, so a change can never write a
  column outside the engine's pick.
- Coalescing is the throughput lever: a hot customer's 100 tracks in one batch are one row update.
- Hydration is a cache fill, not a mutation: the baseline is Postgres itself. The log carries
  tracks only; `revision.before = 0` on a first track is legal. The sqlite backend keeps its
  logged initialize.

### The committer: one funnel per worker, one transaction per flush

Postgres charges per transaction (3–4 round trips ≈ 3–4 ms in-region), not per row (≈ 0.05 ms)
or per fsync (concurrent commits already share one WAL flush). One transaction per partition
batch caps a worker at `pool × 1/txn_latency` ≈ 1,000 tracks/s on a pool of 4, which is our
average with no peak headroom and a PgBouncer budget we cannot grow. One transaction per flush
carries every partition's ready batch: ≈ 5,000 rows/s per worker at 20 rows a flush, growing
with batch size. Published single-row vs multi-row update numbers are ~27× apart.

```
 ┌─ committer (per worker), concurrency = pool size ─────────────────┐
 │ queue ◄── apply({ partition, records }) from every partition writer │
 │                                                                     │
 │ flush   starts whenever a connection is free and the queue has work │
 │   1 take   everything queued, capped at 500 rows; rest waits        │
 │   2 fold   same row twice → first before, last after (per customer) │
 │   3 write  BEGIN                                                    │
 │              UPDATE customer_entitlements … FROM (VALUES …) v       │
 │                WHERE ce.id = v.id AND <before guards> RETURNING id  │
 │              same for rollovers, usage_windows; INSERT/DELETE lists │
 │              UPDATE balance_partition_progress for each partition   │
 │            COMMIT                                                   │
 │   4 settle each partition's apply promise; map put; receipts       │
 └─────────────────────────────────────────────────────────────────────┘

latency   idle: same as a private transaction (a flush starts at once)
          loaded: at most one flush of waiting, a few ms, instead of an unbounded pool queue
window    0 ms. A constant on the committer; write-behind (reply after Kafka append, flush
          every ~1 s like SyncBatchingManagerV3) is a later knob, not a rewrite.
```

Isolation inside a flush:

| case | handling |
|---|---|
| one row's `before` no longer matches | CAS is in the `WHERE`: that row is skipped, `RETURNING` names the survivors, the rest commit; the skipped mutation is stale |
| a multi-row mutation partially matched | roll the flush back, retry partition by partition; only that partition fails |
| row lock held by another writer (reset cron `FOR UPDATE`) | `lock_timeout` ≈ 50 ms on the flush → retry per partition; only the blocked partition waits |
| a hot partition queues 100 mutations | the 500-row cap bounds the flush; leftover rolls forward |
| Postgres down | every flush fails, every partition enters recovery, as SQLite failure does today |

The Kafka append stays per partition: one fenced producer each is the ownership guarantee.
Only the apply moves from the partition to the worker.

### Stale subject: the backstop

```
CAS fails in a batch
  ROLLBACK the batch's row changes
  advance progress past the batch in its own statement          replay must not re-apply it
  evict every subject the batch projected                        next command re-hydrates from PG
  reject the batch's waiters: PartitionWriterStaleStateError     HTTP 409 stale_subject, retryable
  keep draining                                                   the partition stays healthy
```

Why a conflict can happen at all, and the pushed invalidation that makes it rare, is in
`plans/balance-worker-concurrent-writers.md`. The log keeps the superseded record; "applied"
is a Postgres fact, not a log fact.

### Two backends behind one port, `state/` untouched

`state/` stays as it is: it is the sqlite backend. Its port, record types, errors and asserts are
reused by everything; its repos, actions and checkpoint code are SQLite-shaped and are not. The
only change inside it is a type split so the port stops carrying SQLite-only methods.

```
state/types/stateStore.ts
  StateStore              readState · readOwnState · readReceipt · readNextOffset
                          initializePartition · applyDurableMutations (async) · close
  CheckpointStateStore    StateStore & { capturePartitionCheckpoint · restorePartitionCheckpoint
                          · pruneExpiredReceipts }   what state/ returns, what checkpoint/ requires
state/stateBackend.ts     export const STATE_BACKEND = "postgres" as const        ← the revert switch
state/openStateStore.ts   sqlite → today's store · postgres → the committer's StateStore

processor/writer/pendingMutations.ts        the one map, already here
  projectedStateBySubjectKey → { state, recentCommands }
  written by decide, kept after commit, byte-bounded, eviction skips keys in pendingByCustomerKey
  writer reads map[cus] ?? stateStore.readOwnState()   sqlite → row · postgres → null → hydrate

committer/                                  the postgres backend, one per worker
├── createCommitter.ts                      queue · flush loop · concurrency = pool size
├── createCommitterStateStore.ts            the StateStore adapter: reads → null,
│                                           progress mirror, applyDurableMutations → apply
├── flush/                                  takeBatch · foldRowChanges · runFlush · settleFlush
└── types/

types/workerDb.ts                           port grows: applySubjectRowChanges · partitionProgress
external/postgres/getWorkerDb.ts            the one binding, grows the same two methods
packages/postgres/src/
├── subjects/repos/applySubjectRowChanges/  rowChangeSql.ts · applySubjectRowChanges.ts
└── meteringLog/repos/partitionProgress.ts  balance_partition_progress
```

`check` reads through `writer.readFreshestState` (what hydration already uses) instead of
`stateStore.readState`, so it is backend-blind. `STATE_BACKEND = "postgres"` turns checkpoint
maintenance and standby preparation off in `openWorkerResources`. Bootstrap in postgres mode is
progress-only:

```
progress null                 → initialize at log end     (earlier records are another backend's)
progress < log start          → continue at log start     (unacked records aged out; warn)
progress ∈ [start, end]       → continue
progress > log end            → refuse                    (as today)
```

### Flow after the change

```
server                        worker                                   postgres
────────                      ──────                                   ────────
track ─────────────────────►  ensureSubject: cache miss → getSubjectRows ─► rows
                              decide against cached state
                              Kafka append (fenced)
                              PG txn: CAS changes · progress ──────────► committed
reply { result, state } ◄──── cache put · settle
customers.get ────────────────────────────────────────────────────────► reads the same rows
```

## Plan

Order: prove one column moves in Postgres end to end, then every change shape. Each unit green on its own; SQLite suites stay green throughout because the
sqlite backend is a move, not a rewrite.

### 0 · [ ] worker → async port, type split, constant (no moves)

**goal** — two backends can exist; nothing behaves differently
**steps** — `StateStore.applyDurableMutations` returns a Promise; writer `applyBatch` awaits it (recovery mapping unchanged); follower handler already may return a Promise · `CheckpointStateStore` split; `state/` returns it, `checkpoint/` and bootstrap restore require it · `STATE_BACKEND` constant, `openStateStore` switch (postgres branch throws "not wired" until unit 1) · `check` reads through `writer.readFreshestState`
**verify** — worker unit 435 + kafka integration + server balance suites, unchanged counts

### 1 · [ ] postgres + worker → one `customerEntitlements` update lands in Postgres

**goal** — a track against a routed customer moves `customer_entitlements.balance` in Postgres, and the reply waits for it
**steps** — migration: `balance_partition_progress` (`bun db`) · `packages/postgres`: `subjects/repos/applySubjectRowChanges` for `update` on `customerEntitlements` only, `meteringLog/repos/partitionProgress`; `WorkerDb` and `getWorkerDb` grow both · worker `committer/`: `createCommitter` with a flush of one partition batch (the queue and fold come in unit 2), `createCommitterStateStore` with the progress mirror · writer map: kept after commit, byte bound, pinned eviction, `recentCommands` answers `readReceipt` · hydration adopts rows into the map inside `decide` (a `MutationResult` kind `adopt`), no log record · `openWorkerResources` skips checkpoints in postgres mode · postgres-mode bootstrap plan · `WorkerDb` gains the write methods so tests stand them in
**verify** — postgres package: SQL param tests + one lane against the dev-services Postgres · worker: writer tests over a fake PG port; `tests/integration/postgres/track-commits.test.ts` (Kafka + Postgres): track → row balance moved → progress = log end; restart mid-batch → replayed once; retry same commandId while warm → duplicate reply

### 2 · [ ] postgres + worker → the committer, every change shape, stale subject

**steps** — `committer/`: one per worker, `apply({ partition, records })` queued, flush loop with concurrency = pool size, 500-row cap, `lock_timeout`, per-partition retry fallback; unit 1's per-partition transaction becomes a flush of one · `rowChangeSql` for insert/delete and for `rollovers`, `usageWindows`, `customerProducts`, `customerPrices` (column allowlist from the worker row schemas; numeric tolerance), multi-row `UPDATE … FROM (VALUES …) RETURNING id` per table · `foldRowChanges` per row within a flush · `StaleSubjectStateError` → rollback, progress-only advance, evict, `PartitionWriterStaleStateError` → 409 `stale_subject` in the error handler; the writer keeps draining · entity subjects: entity map entries, customer revision in memory · `recentCommands` bounded per entry
**verify** — worker integration: rollover draw, usage-window counter insert then update, entity track, 50 tracks on one row in one flush → one row update; three partitions' batches → one transaction; one partition's stale row → only its waiters get 409; map entry evicted; a row moved underneath (UPDATE in the test) → 409, next track re-hydrates and succeeds, progress advanced · engine parity: replay every engine fixture mutation through `rowChangeSql`

### out of scope: the server's other reads

Track and check keep their shape: the worker replies rows, the server overlays them on its own
FullSubject for the catalog-derived fields (`workerStateToApiBalance`), so both responses are
correct after this change. `customers.get`, `customers.list`, `entities.list` still read the Redis
FullSubject, which is not told about worker commits. Handled with the Redis cut-over, not here.

### 3 · [ ] sweep → dw, staging

**config, per deployment** (the worker's env; only the local one lives in this repo,
`scripts/devServices/balanceWorkerDevConfig.ts`; staging and prod task definitions are in infra):

```
routed workers    STATE_BACKEND = "postgres" (the code default since unit 3)
                  BALANCE_WORKER_DATABASE_URL   the primary, never a replica: the committer writes
                  BALANCE_WORKER_DATABASE_POOL_SIZE   the lane ceiling; concurrency is tuned live below it
                  BALANCE_WORKER_CHECKPOINT_MODE = off   (ignored on postgres, keep it explicit)
                  S3_BUCKET / S3_REGION          the admin bucket, for edge configs (DB control)
shadow workers    config.stateBackend = "sqlite"  a shadow track must never move a real row
local (bun dw)    DATABASE_URL is the worktree branch; S3_BUCKET/S3_REGION pass through when set
```

**steps** — `bun dw` and staging task defs: checkpoint mode off, `BALANCE_WORKER_DATABASE_URL` on the primary; shadow deployment pinned to the sqlite backend until shadow has a dry-run store · pool size review (one transaction per batch per partition; PgBouncer transaction mode) · EXPLAIN the CAS updates on staging · `fillfactor` on `customer_entitlements` so balance-only updates stay HOT, autovacuum settings for it · benchmark: synthetic 5k and 15k tracks/s over a few thousand customers on staging for an hour, recording commit latency, flush size, WAL rate, replica lag, bloat · README note per backend
**verify** — full worker + server suites; staging: routed sandbox org, track → PlanetScale row moved within the reply

## Ordering and stacking

One stacked branch per unit (`gh stack`, base `og/balance-kafka-msk-auth`):
`state-backends`, `pg-commit`, `pg-all-changes`, `pg-sweep`.

## Decisions

1. **Reply after the Postgres commit**, in the same place the reply waits for SQLite today. Speed-ups later.
2. **Kafka before Postgres.** Kafka is the event log of mutations and the fence; progress in
   Postgres makes replay exactly-once.
3. **Backend is a constant, not an env var.** `STATE_BACKEND` in `state/stateBackend.ts`.
4. **Receipts live in memory on the map entry.** Decided 2026-09-18. Each entry keeps its last N
   command ids with their fingerprint (N ≈ 32, counted in the entry's bytes), written on commit
   and on replay; `readReceipt` answers from there. In-flight retries are caught by
   `pendingByKey`, warm retries and post-crash replays by the entry. A retry after eviction, a
   restart or an ownership move applies again; if that ever matters, receipts move to a Postgres
   table or the server claims the key the way the Redis route does. No mutation JSON is kept
   anywhere but the log. `receiptPolicy` / `BALANCE_WORKER_RECEIPT_RETENTION_MS` stay sqlite-only.
5. **Hydration is a map fill.** Decided 2026-09-18. In postgres mode `hydrateSubjectState` fetches
   rows and hands them to `decide` for adoption; no initialize record on the log, the first
   track is revision 0 → 1, and the applier has no command-shaped branch. The `initialize` route and
   `initializeSubject` are left untouched; nothing calls them in postgres mode (only the shadow
   operator does, on sqlite). A log reader needs Postgres for a baseline.
6. **Stale subject is retryable, not fatal.** 409 `stale_subject`, evict, advance progress. The
   pushed invalidation that makes it rare is deferred (`balance-worker-concurrent-writers.md`).
7. **`state/` is left intact** as the sqlite backend and is what a shadow deployment must run.
   Reused from it: the port, record types, errors, asserts. Not reused: its repos, actions,
   checkpoint code. New code is `committer/` beside it, and the map already in the writer.
8. **`revision` is memory-only in the postgres backend.** No new column on customer rows.
9. **One committer per worker.** Decided 2026-09-18. One transaction per flush across partitions,
   concurrency = pool size, window 0, 500-row cap, `lock_timeout`, per-partition retry as the
   isolation fallback. Kafka appends stay per partition.
10. **Routing and cut-over are their own plan**, `plans/balance-worker-routing.md`.
