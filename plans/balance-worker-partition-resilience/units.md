# Units of work

Ordered; each ends in a passing test. Unit 1 alone fixes the 2026-09-22 crash and its replay loop.

**Overlap warning.** The dedup work (`plans/balance-worker-dedup`) is editing
`createMeteringRecordHandler.ts`, `commit.ts`, `decide.ts` in this worktree right now. Units 1 and
4 touch the first two. Land dedup first, or do these on a stacked branch and rebase.

| # | unit | files | ends with this passing |
|---|---|---|---|
| 1 | **The flush default flips.** `landFlush`: transient allowlist unchanged; `FlushBookmarkConflictError` is the one *failure* (lost ownership); every other error is a refusal. `refusalOf` keeps its lock mappings, adds `StaleSubjectRowsError → StaleSubjectError`, and defaults to `FlushRecordRefusedError` (logged `error`, not `warn`). Error handler: `StaleSubjectError` → 409 `STALE_SUBJECT` retryable; `FlushRecordRefusedError` → 500 with its own code. | `committer/actions/landFlush.ts`, `committerErrors.ts`, `http/handlers/errorHandler/createWorkerErrorHandler.ts` | `committer.test.ts`: stale row → rejected, bookmark past it, siblings land · unsupported change → rejected · bookmark conflict → failed · `committer-state-store.test.ts:153,178` flipped · `createBalanceWorkerApp.test.ts`: caller gets 409 STALE_SUBJECT and the next track on that customer re-hydrates and lands |
| 2 | **Transient means wait, not die.** `runWithRetries` retries until the partition's abort signal fires, backoff capped at `maxBackoffMs`; after `maxAttempts` it flips a `degraded` flag the health reporter logs and clears on the next landing. Callers keep waiting on `waitForCommit` (their own request deadline bounds them). | `landFlush.ts`, `createCommitter.ts`, `health/createWorkerHealthReporter.ts` | `committer.test.ts`: 5 transient failures then success → lands, one `degraded` transition each way · abort mid-retry → every waiter rejects with the abort cause, nothing skipped |
| 3 | **A bad log parks one partition.** `onRecordError` and the resume-offset path stop throwing out of `eachBatch`. The handler pauses that partition (`consumer.pause`), reports `partition_parked` with the cause, and the group's existing park/retry timer owns it; other partitions keep flowing. `StateBehindKafkaLogStartError` takes the same door. | `kafka/meteringConsumer/createMeteringRecordHandler.ts`, `meteringErrors.ts`, `packages/kafka/src/consumer/consumeBatch.ts`, `partitions/health/partitionHealthChecks.ts` | `kafka-metering-consumer.test.ts:956,994,1026,761` become "parks partition N, partition M's next batch still applies" · `kafka-owned-partition-group.test.ts`: a parked partition answers 409, the others 200; a retry after the log is repaired resumes from the bookmark |
| 4 | **Process trouble ends the process.** A consumer crash kafkajs will restart from (`restart: true`) is left to rejoin as today; one it will not (`restart: false`) and a failed retirement both go through `stopServiceThenNotify` so `onServiceStopped` → `exit(1)`. `retirementFailed` stays as the guard against a half-retired restart. | `partitions/allocation/partitionAllocation.ts`, `partitionService.ts`, `packages/kafka/subscribePartitionChanges.ts` (passes `restart`) | `kafka-owned-partition-group.test.ts`: failed retirement → `service-stopped`; restartable crash → rejoin restarts partitions, no stop; non-restartable crash → `service-stopped` · `ownershipAdmission.test.ts:807` unchanged |
| 5 | **The real race, end to end.** Worker integration: track and `DELETE` of the same customer 40 ms apart → track 409 `STALE_SUBJECT` or 404, bookmark advanced, worker still owns the partition, the next track on a fresh customer lands; restart → offset replays as `rejected`, no crash. Then the usage-alert parity run resumes. | `tests/integration/postgres/track-commits.test.ts` | the new case, then `bun t balances/track/usage-alerts` on the worker path |

## Found on the way (unit 5)

`commitFlush` committed even when a guarded row did not apply: the bookmark and the record's
other rows landed, and only then did `runFlush` throw stale. That is why the incident's replay
saw "Flush advanced 0 of 1 bookmarks" on every retry, and why the unit-1 skip flush conflicted.
Now a flush with any unapplied guarded row rolls back whole (`FlushRolledBack` inside the
transaction), which is what `createFakeCommitterDb` in the unit tests had assumed all along.

A plain track is an unguarded increment (`balance = balance - 5`), so a balance changed
underneath does not count as stale; only a row that is gone or a guarded `update` does. The
integration case therefore deletes the grant row, the exact shape of the customer-delete race.

## Decisions

1. Unknown ⇒ refuse, not hold. A bug that refuses every record degrades loudly (500s, `error` logs)
   instead of freezing the bookmark; callers see it, nothing is silently lost.
2. Bookmark conflict is the only record-side failure that stops a partition: it is proof another
   worker owns it.
3. Consumer-read errors park, never skip, never crash the group: skipping loses a write the caller
   was already told about; crashing loses three healthy partitions.
4. Zombies exit. A worker that owns nothing and cannot take assignments is worse than a dead one:
   the scheduler only replaces dead ones.
5. No new readiness endpoint in this pass; `partition_health` logs stay the signal.

## Follow-ups landed after unit 5

| # | change | ends with this passing |
|---|---|---|
| 6 | **A refused record has a name.** `FlushRecordRefusedError` → worker `500 RECORD_REFUSED` → client code → server `balance_worker_record_refused`; callers can tell "your command will never land" from "the worker broke". | `createBalanceWorkerApp.test.ts`, `request-flow.test.ts` |
| 7 | **A live owner can park.** The retry cleanup is a full retirement (`retirePartition`: drain → release the claim → stop → quiesce), so the `!entry.claimed` guard on parking is gone: a claimed partition whose log turns unreadable is released and retried alone instead of stopping the group. | `kafka-owned-partition-group.test.ts` "parks a claimed partition…"; `ownershipAdmission.test.ts` now pins one stop per parked entry |
| 8 | **Herald lands batches the same way.** `stream/landRecords/`: a store failure (Postgres `errno`, `TinybirdError`, socket codes) waits in place with capped backoff and a `herald_store_waiting` warn every 5 attempts, never thrown to kafkajs; a job-code throw is bisected to the one record, skipped with `herald_record_skipped`, the rest land; `stop()` aborts a wait without skipping. Tinybird already quarantines bad rows and the events insert already isolates refusals, so no store can refuse one record. | `apps/herald/tests/unit/stream/land-records.test.ts` |

## Decided 2026-09-22: refusals and `durability: "log"`

A `"log"` caller (the default since c3b71285b1) is answered once Kafka has the record, so a
later stale skip cannot reach it: the caller keeps its 200, the skip is logged at error, and
Postgres never gets that write. Accepted. `STALE_SUBJECT` / `RECORD_REFUSED` reach only
`"store"` callers. The lever if this ever matters: every writer of `customer_entitlements`,
`usage_windows`, `rollovers` or `balance_locks` must evict the worker, so a stale guard stays
the rare case it is meant to be.

## 2026-09-22 follow-up

- `track-commits.test.ts` "row deleted underneath a decision" still asserted a 409 to an HTTP track. Since
  the log-durability merge a `"log"` caller is answered at Kafka append and the store's refusal is an
  accepted loss, so the case now asserts that: reply from memory, bookmark past the skipped record,
  re-hydration on the next track. Its Postgres reads poll for the flush like the file's other cases.
