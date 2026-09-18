# Balance worker: commit to Postgres, not SQLite

2026-09-18 · john/one-record · c2c85bef18 · plan, not yet approved

Follows `plans/balance-worker-customer-state.md` and `plans/balance-engine-commands.md`.
One change: the durable medium under the `StateStore` port moves from a private SQLite file
to the shared Postgres tables. Kafka stays the ordered log and the fence. SQLite stays as a
second backend, selected by config, so a revert is a config change.

## Context

### the write path today
[apps/balance-worker/src/processor/writer/ · state/ · kafka/meteringConsumer/]

```
track ─► ensureSubject (async)          hydrate from PG on miss → initialize mutation
      ─► writer.decide (sync)           readFreshestState = pending projection ?? stateStore.readOwnState
                                        readReceipt (dedup by commandId + fingerprint)
                                        enqueue; projection per subject
      ─► commit (async, batched)        appender.appendCommitted  (Kafka, fenced txn)
                                        stateStore.applyDurableMutations (SQLite, one txn per batch)
                                          applyRecord: receipt guard · revision guard · progress guard
      ─► reply { result, changes, state }
follower  consumer → applyDurableMutations, position_already_applied when the writer got there first
restart   bootstrap: local progress ∨ S3 checkpoint ∨ log start → replay → ready
```

- `StateStore` owns three tables: `subject_states` (one JSON per subject key), `mutation_receipts`,
  `partition_progress`. Every other module reaches SQLite only through this port.
- `applyDurableMutations` is synchronous; the writer and the follower both call it. The consumer
  handler already accepts a Promise (`TopicRecordHandler.applyRecord`), the writer does not.
- Checkpoints, S3, bootstrap "restore/replace", and standby "prepare" exist because SQLite is
  private to one process. ~24 test files / ~80 cases are coupled to that.
- Hydration reads Postgres once (`getSubjectRows`) and never writes back. Postgres is therefore
  stale for any routed customer for as long as the worker owns it: the dual source of truth.

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

### who else writes those rows
[server/src/cron/resetCron/ · billing/v2/execute/ · balances/utils/sync/syncItemV4.ts]

- Reset cron, batch reset, billing v2 execute (attach, transitions), pooled balances, update-balance
  API, invoice.created rollover inserts, usage_windows `setWindows`, entity create/delete.
- The Redis path syncs back through `sync_balances_v2($json)` guarded by `RESET_AT_MISMATCH`,
  `ENTITY_COUNT_MISMATCH`, `CACHE_VERSION_MISMATCH`; on conflict it drops the sync and deletes the
  cached full customer. That is the precedent: a guarded write, and eviction on conflict.
- For a routed customer the Redis path does not track, so `syncItemV4` has nothing to sync. The
  structural writers above still land at any time.

### what the server does with a reply
[server/src/internal/balances/track/balanceWorker/ · balanceWorker/workerStateToApiBalance.ts]

- Reads `result` and `state`; never `changes`. Overlays `balance`/`adjustment`/rollover fields onto
  its own FullSubject (Redis-cache-first) and runs `getApiBalanceV2`.
- `customers.get`, `customers.list`, `entities.list` read the FullSubject only. Nothing merges
  worker state into them. After this change they read Postgres rows the worker committed, but
  the Redis FullSubject for that customer is stale until invalidated.
- Live routing is `BALANCE_WORKER_ROLLOUT_ENABLED` (dev only, sandbox only). Shadow runs on staging
  against real orgs through an edge config and must never write balances.

## Target model

### Postgres is the materialization, Kafka the log, memory the working set

```
                     ┌─ writer (per partition) ─────────────────────────────────────┐
 command ──ensure──► │ subject cache: lru<subjectKey, { state, receipts }>           │
                     │   miss → getSubjectRows + live receipts → cache put           │
                     │ decide (sync): projection ?? cache · receipt in cache         │
                     │ commit: Kafka append (fence) → PG txn → settle waiters        │
                     └───────────────────────────────┬──────────────────────────────┘
                                                     │ one transaction per batch
                     ┌─ Postgres ────────────────────▼──────────────────────────────┐
                     │ customer_entitlements · rollovers · usage_windows   CAS on before │
                     │ balance_mutation_receipts                          dedup, 24h    │
                     │ balance_partition_progress                         next_offset   │
                     └──────────────────────────────────────────────────────────────┘
```

Three facts, one each:

1. **The reply waits for the Postgres commit.** Anything a client learned is in Postgres. `customers.list`
   reads rows, never the worker. The dual source of truth is gone for committed state.
2. **Kafka is still the log of truth for recovery.** Append first (transactional producer = the
   fence), then apply. A crash between the two is replayed from `balance_partition_progress`;
   receipts make the replay and the client's retry converge on one deduction.
3. **Memory is a cache of Postgres, never the truth.** The subject cache is the same shape as the
   catalog cache (`lru-cache`, bytes-bounded, one tier in front of Postgres). Eviction is free;
   a re-hydration rebuilds the entry. `revision` lives in memory only and restarts at 0 per
   hydration; the log's `before`/`after` are the guard, the revision only orders pending mutations.

### The commit: one transaction, row changes as guarded SQL

```
applyDurableMutations(records)                                     postgres backend
  BEGIN
  for each record, in log order
    receipt exists with same fingerprint → skip changes           duplicate
    command.type = initialize           → skip changes            baseline: its rows came from PG
    for each change
      update → UPDATE t SET <after> WHERE id = $id AND <before…>  rowcount ≠ 1 → StaleSubjectStateError
      insert → INSERT                                             conflict    → StaleSubjectStateError
      delete → DELETE WHERE id = $id                              rowcount ≠ 1 → StaleSubjectStateError
    INSERT receipt ON CONFLICT DO UPDATE WHERE record_offset < EXCLUDED.record_offset
  UPDATE balance_partition_progress SET next_offset WHERE next_offset = $expected
  COMMIT
  cache.put(nextState per subject) · cache receipts
```

- Numeric CAS uses the engine's tolerance: `abs(col - $v) < 1e-9`; jsonb columns compare with `=`.
- `SET` and `WHERE` columns come from the worker row schema's keys, so a change can never write a
  column outside the engine's pick.
- The `initialize` rule is the one command-shaped branch in the applier: a baseline is not a write.
  A future `attach` inserts real rows as its own command type.

### Stale subject: the backstop, not the mechanism

```
CAS fails in a batch
  ROLLBACK the batch's row changes
  advance progress past the batch in its own statement          replay must not re-apply it
  evict every subject the batch projected                        next command re-hydrates from PG
  reject the batch's waiters: PartitionWriterStaleStateError     HTTP 409 stale_subject, retryable
  keep draining                                                   the partition stays healthy
```

The primary mechanism is the same one the Redis cache uses: **the server pushes an invalidation
when it writes a routed customer's rows**. Every site that already calls `deleteCachedFullCustomer`
or `invalidateSharedBalanceFields` also posts `/v1/subjects/invalidate { identity }` to the owner,
the sibling of catalog invalidation. The CAS is what makes a missed signal safe rather than wrong.
The log keeps the superseded record; "applied" is a Postgres fact (the receipt), not a log fact.

### Two backends behind one port

```
apps/balance-worker/src/state/
├── types/stateStore.ts            the port; applyDurableMutations is async for both
├── sqlite/                        today's store, moved whole: repos/, actions/, checkpoint/
└── postgres/
    ├── createPostgresStateStore.ts
    ├── subjectCache/              lru of { state, receipts } per subject key, pin while pending
    ├── actions/
    │   ├── applyDurableMutations/ applyBatch.ts · applyRecord.ts · rowChangeToSql.ts · staleSubject.ts
    │   ├── hydrateSubject.ts      getSubjectRows + readLiveReceipts → cache
    │   ├── initializePartition.ts progress row: none → log end
    │   └── pruneExpiredReceipts.ts
    └── types/

packages/postgres/src/balances/
├── repos/rowChanges/              rowChangeSql.ts · applyRowChanges.ts
├── repos/mutationReceipts.ts      readLiveReceipts · upsertReceipt · deleteExpiredReceipts
├── repos/partitionProgress.ts     readNextOffset · insertProgress · advanceProgress
└── types/
```

`BALANCE_WORKER_STATE_BACKEND=sqlite|postgres`. `postgres` requires `BALANCE_WORKER_CHECKPOINT_MODE=off`
and forbids standby preparation; `sqlite` is unchanged and is what shadow deployments run, since a
shadow track must never move a real row. Bootstrap in postgres mode is progress-only:

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
track ─────────────────────►  ensureSubject: cache miss → getSubjectRows ─► rows + receipts
                              decide against cached state
                              Kafka append (fenced)
                              PG txn: CAS changes · receipt · progress ─► committed
reply { result, state } ◄──── settle
customers.get ────────────────────────────────────────────────────────► reads the same rows
```

## Plan

Order: prove one column moves in Postgres end to end, then every change shape, then the
server's view, then the push signal. Each unit green on its own; SQLite suites stay green
throughout because the sqlite backend is a move, not a rewrite.

### 0 · [ ] worker → `state/sqlite/`, async port (pure move)

**goal** — two backends can exist; nothing behaves differently
**steps** — move `state/{repos,actions,createStateStore,open*}` under `state/sqlite/`; `StateStore.applyDurableMutations` returns a Promise; writer `applyBatch` awaits it (recovery mapping unchanged); follower handler already may return a Promise · `openStateStore({ backend })` factory in `state/openStateStore.ts`
**verify** — worker unit 435 + kafka integration + server balance suites, unchanged counts

### 1 · [ ] postgres + worker → one `customerEntitlements` update lands in Postgres

**goal** — a track against a routed customer moves `customer_entitlements.balance` in Postgres, and the reply waits for it
**steps** — migration: `balance_mutation_receipts`, `balance_partition_progress` (`bun db`) · `packages/postgres/src/balances/`: `rowChangeSql` for `update` on `customerEntitlements` only, receipts and progress repos, `applyRowChanges` running one transaction · worker `state/postgres/`: subject cache, `hydrateSubject`, `applyDurableMutations` (initialize = baseline rule, receipt guard, progress guard), `initializePartition` at log end · env `BALANCE_WORKER_STATE_BACKEND`, refinement against checkpoint mode · postgres-mode bootstrap plan · `WorkerDb` gains the three write methods so tests stand them in
**verify** — postgres package: SQL param tests + one lane against the dev-services Postgres · worker: writer tests over a fake PG port; `tests/integration/postgres/track-commits.test.ts` (Kafka + Postgres): track → row balance moved → receipt row → progress = log end; restart → no re-apply; retry same commandId → duplicate

### 2 · [ ] postgres + worker → every change shape, stale subject

**steps** — `rowChangeSql` for insert/delete and for `rollovers`, `usageWindows`, `customerProducts`, `customerPrices` (column allowlist from the worker row schemas; numeric tolerance) · `StaleSubjectStateError` → rollback, progress-only advance, evict, `PartitionWriterStaleStateError` → 409 `stale_subject` in the error handler; the writer keeps draining · `pruneExpiredReceipts` on an interval per owned partition · entity subjects: entity cache entries, customer revision in memory
**verify** — worker integration: rollover draw, usage-window counter insert then update, entity track; a row moved underneath (UPDATE in the test) → 409, next track re-hydrates and succeeds, PG progress advanced, no receipt for the superseded record · engine parity: replay every engine fixture mutation through `rowChangeSql`

### 3 · [ ] server → the API reads what the worker committed

**goal** — after a worker reply, `customers.get` and `customers.list` show the committed balance
**steps** — routed customers: `getFullSubject` must not serve cached balance fields, so after a worker track the server deletes the cached full customer (the `syncItemV4` conflict precedent) or, better, routed orgs skip the balance layer of the FullSubject cache; decide in the unit · `loadBalanceWorkerSubject` reads Postgres-fresh rows · keep `workerStateToApiBalance` as the reply overlay
**verify** — `server/tests/integration/balances/balanceWorker/` (first real-DB worker test, worker in-process like `worker-fixture.ts` over the test Postgres): track → `customers.get` balance moved → `entities.list` unchanged for other entities

### 4 · [ ] server + client + worker → pushed subject invalidation

**steps** — client `invalidateSubject({ identity })` routed to the owner (sibling of `invalidateCatalog`) · worker `http/handlers/receiveInvalidateSubject.ts` → cache evict (pending mutations settle first) · server `notifyBalanceWorkerOfSubjectChange` from `deleteCachedFullCustomer` / `invalidateSharedBalanceFields` / reset execute, fire-and-forget, behind the rollout flag
**verify** — integration: hydrate, attach a plan on the server, next track sees the new rows with no 409

### 5 · [ ] sweep → config, dw, staging

**steps** — `bun dw` and staging task defs: `BALANCE_WORKER_STATE_BACKEND=postgres`, checkpoint mode off, `BALANCE_WORKER_DATABASE_URL` on the primary; shadow deployment stays `sqlite` · pool size review (one transaction per batch per partition; PgBouncer transaction mode) · EXPLAIN the CAS updates on staging (by-id, trivial; confirm) · README note per backend
**verify** — full worker + server suites; staging: routed sandbox org, track → PlanetScale row moved within the reply

## Ordering and stacking

One stacked branch per unit (`gh stack`, base `og/balance-kafka-msk-auth`):
`state-backends`, `pg-commit`, `pg-all-changes`, `server-pg-view`, `subject-invalidate`, `pg-sweep`.

## Decisions

1. **Reply after the Postgres commit.** Latency +5–20 ms per track; buys "the API reads what the
   client saw". Replying after the Kafka append and committing behind is a later optimisation,
   not the default.
2. **Kafka before Postgres, as today.** The append is the fence and the recovery log; progress in
   Postgres makes replay exactly-once with receipts. The alternative, Postgres before Kafka, would
   drop progress/replay/follower catch-up and keep the log free of superseded records, at the
   price of fencing by CAS only and a log that can miss a record on crash. Revisit if stale
   subjects turn out to be common.
3. **Two bookkeeping tables**, `balance_mutation_receipts` and `balance_partition_progress`.
   Memory-only receipts would double-apply across a restart or an ownership move.
4. **A baseline is not a write.** `initialize` mutations apply no row changes in the postgres
   backend; the log still records them so hydration stays a mutation and the writer is backend-blind.
5. **Stale subject is retryable, not fatal.** 409 `stale_subject`, evict, advance progress, keep
   draining. Pushed invalidation (unit 4) is the mechanism; CAS is the backstop.
6. **SQLite is the shadow backend.** Kept whole under `state/sqlite/`, selected by config, run by
   shadow deployments, so the revert path is exercised in CI and on staging rather than rotting.
7. **`revision` is memory-only in the postgres backend.** No new column on customer rows; the
   per-row `before` is the durable guard.
