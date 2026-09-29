---
author: john + claude
feature: balance-worker-partition-resilience
date: 2026-09-22
status: ready-for-review
---

# No single record takes a partition down

The rule the worker should obey, and the three seams where it does not today.

```
a failure is one of exactly two things
  the STORE is unavailable   → the record is fine: retry, pause, never crash
  the RECORD is wrong         → skip it with its bookmark, tell its caller, evict its subject
process-level trouble (consumer crash, retirement that will not settle) → exit, get replaced
```

## What happened on 2026-09-22

```
track cus X ──► worker reads rows, decides, flushes
DELETE cus X ─► 40 ms later; cascades the usage_windows row
flush: UPDATE usage_windows … WHERE id=… AND usage=<before> → 0 rows
runFlush.ts:166      StaleSubjectRowsError
landFlush.ts:24-62   not transient, not a refusal → "failed"
commit.ts:113-117    caller 500, writer enters recovery, subject map cleared
replay handler :99   throws → kafkajs ×3 → CRASH → every partition retired
partitionAllocation.ts:112-133  retirement fails → retirementFailed=true
                     process alive, /health alive, every request 409 NOT_OWNER
restart              offset 2584 replays, same guard, same crash
```

`plans/balance-worker-postgres-commit.md:338` already decided "stale subject is retryable, not
fatal: 409, evict, advance progress". The code inverted it: `refusalOf` is an allowlist (SQLSTATE
22/23 only) and everything unknown holds the partition.

## Seam 1: the Postgres flush (`committer/actions/landFlush.ts`)

| error today | class | outcome |
|---|---|---|
| SQLSTATE 08/40001/40P01/57014/53300/57P0x, socket ECONN*/EPIPE/ETIMEDOUT | transient | 3 tries, 50→800 ms, then treated as permanent → crash |
| 23505 / 23503 on `balance_locks` | refusal | skipped, caller 409 / 404, partition fine |
| other 22xxx / 23xxx | refusal | skipped, caller 500 (no handler branch) |
| `StaleSubjectRowsError`, `UnsupportedRowChangeError`, `RowsInvalidError`, `FlushBookmarkConflictError`, anything else | **failed** | tx rolled back, caller 500, writer recovery, replay crash, bookmark frozen |

The caller's HTTP response waits for the flush (`processor/commands/track.ts:46`), so a skipped
record is never a silently lost "ok": its caller was told, and retries against re-hydrated state.
`commit.ts:121-127` already evicts the customer on `rejected`. Replay (`createMeteringRecordHandler.ts:95-104`)
already skips `rejected` silently.

One real exception inside "everything else": `FlushBookmarkConflictError` means another worker
moved this partition's bookmark. That is lost ownership, not a bad record; the partition must
stop (the existing `group_stopping` → exit path), never skip.

## Seam 2: reading the log (`kafka/meteringConsumer/`)

Every decode error (`InvalidRecordError`, `UnsupportedRecordVersionError`, `RecordKeyMismatchError`,
invariant errors like `OutOfOrderMutationError`) becomes `KafkaPartitionInvariantError`
(`retriable: false`) → kafkajs never restarts the consumer → `onCrashed` retires **all** partitions,
process stays alive. `StateBehindKafkaLogStartError` bypasses `onRecordError` entirely
(`consumeBatch.ts:58-63`) with the same result. One bad partition's log kills the other three.

These are not skippable: a malformed or newer-version record is version skew or a writer bug, and
skipping it loses a write the caller was already told about. The right shape is **park that one
partition** (withdraw its route → 409 for it, retry on a timer, loud) while the consumer keeps
serving the rest.

## Seam 3: retirement and the process (`partitions/`)

| path | today |
|---|---|
| terminal partition failure via health / startup | `requestPartitionServiceStop` → `onServiceStopped` → `process.exit(1)` ✓ |
| consumer `CRASH` → `crashPartitionAllocation` | all partitions retired, **no exit** |
| retirement rejects ("did not settle safely") → `retireAllocation` catch | `retirementFailed = true`, **no exit**, `isCurrentAllocation` false forever |

Both leave a zombie: alive, `/health` says alive, owns nothing, 409 to everything, and no future
assignment can start. `scripts/devWithRestart.ts` and the prod scheduler both act only on exit.

## Existing tests that pin today's behaviour (they flip, not vanish)

- `committer-state-store.test.ts:153` stale row → `failed`, bookmark frozen
- `committer-state-store.test.ts:178` baseline record refused with `UnsupportedRowChangeError`
- `committer.test.ts:130` a poison record is isolated (stays true)
- `kafka-owned-partition-group.test.ts:44` failed retirement stops the group (add: service-stopped)
- `kafka-owned-partition-group.test.ts:554` consumer crash makes partitions unavailable (add: service-stopped)
- `kafka-metering-consumer.test.ts:956,994,1026` malformed / invalid offset / out-of-order are non-retryable (become: park)
