---
author: john + claude
feature: balance-worker-dedup
date: 2026-09-21
status: ready-for-review
---

# Stopping a command from applying twice on the balance worker

Two pieces of work, in order. Part A fixes a gap that is live today. Part B is async track on a
command topic, which is new and builds on A.

## What's inside

- `overview.md` — what exists, where a track can apply twice today, the target model, decisions.
- `units.md` — the ordered units of work.

## What exists today

```
handleTrack.ts:39   if (isBalanceWorkerRolloutEnabled()) return runBalanceWorkerTrack()
                    ↑ first statement. Skips withIdempotencyKey (DynamoDB), skips async, skips batch.

worker decide.ts    (a) pendingByKey           in flight              → joins, same reply
                    (b) stateStore.readReceipt sqlite only; postgres returns null
                    (c) subjects.readCommand   in memory, 32 ids per customer → 409 DUPLICATE_COMMAND
```

Production runs the postgres backend, so (c) is the only memory of a finished command.

| where the memory is lost | file |
|---|---|
| restart, ownership move, partition retry: a new empty writer every time | `partitionStartup.ts:34` |
| any commit failure: `rejectAllPending` clears the whole map | `pendingMutations.ts:174` |
| the customer's 33rd command pushes out the 1st | `createSubjectMap.ts:13` |
| memory pressure deletes the entry, ids included (`evictCustomer` keeps them, this does not) | `createSubjectMap.ts:59-66` |
| written only by the owner's own commit, never by replay | `commit.ts:130` |

Other facts that shape the work:

- The client never sends twice to an owner that may have applied: a timeout is a 503
  `balance_worker_result_unknown` telling the caller to retry with the same key (`sendToOwner.ts:42-84`,
  `balanceWorkerErrors.ts:110`). That retry is the one that double-applies after a restart.
- An event-name track sends one command per feature. A retry finishes a partial run by skipping
  `DUPLICATE_COMMAND` per feature (`runBalanceWorkerTrack.ts:70-89`), so it leans on the same memory.
- Takeover is cold boot. The consumer group moves the partition and the new owner runs the same
  `completeRuntimeStartup`. `prepare` / `activate` are only called from tests.
- Replay never touches the writer. One handler for the whole worker calls the worker-level store
  (`createMeteringRecordHandler.ts:75`). Records below the bookmark are counted and dropped
  (`applyDurableMutations.ts:31`).
- The follower keeps running after boot, so every record the owner appends comes back through the
  same handler as `position_already_applied`.
- Two gates pull an early seek back to the bookmark: `readResumeOffset`
  (`createMeteringRecordHandler.ts:39`) and the reconcile in `consumeBatch.ts:92`.
- `fetchTopicOffsetsByTimestamp` is in kafkajs 2.2.4, used nowhere, and answers for the whole topic.
- The table is `partition_progress` (the older plan calls it `balance_partition_progress`). The
  bookmark moves in one CTE in `packages/postgres/src/flush/repos/flushSql.ts:25-33`.
- The mutation record schema is `.strict()`. A new field has to be optional or old records stop parsing.
- No command topic has ever existed on any branch. Part B is new.
- kafkajs has no manual `assign()`. Round robin can give `-events[7]` and `-commands[7]` to different
  workers.
- Nothing sets `retention.ms` on the metering topic. Production topics are made outside this repo.

## Target model

### Part A: the log is the receipt

```
                    ┌─ writer, per partition ──────────────────────────────┐
 command ─► decide  │ pendingByKey ∋ id?     → join                        │
                    │ recentCommands ∋ id?   → same fingerprint: duplicate │
                    │                          other fingerprint: conflict │
                    │ else mutate → Kafka → PG → remember(id)              │
                    └──────────────────────────────────────────────────────┘
 recentCommands     gen[now]  id → fingerprint      writes
                    gen[prev]                        reads only
                    every W: drop prev, now → prev   a whole generation at once, no per-id timers
                    remembered for W to 2W

 filled by          the owner's commit
                    the follower, for every record it sees (applied or already applied)
                    boot: seek to min(offsetAt(now − W), bookmark)
                          below the bookmark → remember only
                          from the bookmark  → apply and remember (today's replay)
```

No table, no row per command. The ids are already on the Kafka record (`mutation.id`,
`receipt.fingerprint`). Memory is rate × 2W × bytes per id.

In front of it, the 24 hour promise for a caller's `idempotency_key` stays where it is on the Redis
path: the DynamoDB claim. The worker path gets the same wrapper.

```
duplicate                              how long     who catches it
caller retry, same idempotency_key     24h          DynamoDB claim → 409
retry after a 503 "result unknown"     minutes      recentCommands (the claim was released)
event-name retry finishing a partial   minutes      recentCommands, per feature
caller retry, no key                   never        a new ctx.id is a new track (same as Redis)
```

### Part B: a command topic with its own bookmark

```
server ─► commands[p] ─► owner of p ─► decide ─► mutations[p] ─► PG txn
           offset 41                              source: 41      next_offset
                                                                  command_next_offset = 42
boot: replay mutations onto PG → seek commands[p] to command_next_offset
```

Same key, same partition count, same writer. The command offset rides on the mutation record and
lands in the same statement as the row changes, so a crash never decides offset 41 twice. The same
command at two offsets (41 and 57) is Part A's job.

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | The window's clock | **settled** — wall clock at insert. Boot puts everything it scans into `gen[now]`. Over-remembering costs memory only, and no record timestamp has to be threaded through. |
| 2 | W | **settled** — 10 minutes, one constant. It has to cover a caller's backoff after a 503, not 24h. It is also the boot scan length. |
| 3 | What a duplicate answers | 409, as today and as the Redis path does. No stored replies. |
| 4 | Recovery | `recentCommands` survives `rejectAllPending`. Only applied commands are ever in it. |
| 5 | Log shorter than W | Warn and scan what is there. Never refuse to boot over it. |
| 6 | sqlite backend | Untouched. It keeps `mutation_receipts`; the window sits behind it and is a no-op there. |
| 7 | Both topics on one worker (B) | One consumer, two subscriptions, a custom `PartitionAssigner` that gives partition n of both topics to the same member. |
| 8 | Fence for the command consumer (B) | `transaction.sendOffsets` inside the mutation's transaction. Postgres `command_next_offset` is the truth, Kafka's offset is a hint. |
| 9 | A command that changes nothing (B) | A bookmark-only flush, the way `landFlush` already skips a refused record (`withoutChanges`). |
| 10 | An async track that is refused (B) | **settled** — logged at warn with the command id and reason, then dropped, in `consume/consumeTrack.ts`. Same accepted loss as a refused row after a log-durable reply. |
| 11 | The 24h key claim for async and batch tracks (B) | **settled in principle** — it stays in DynamoDB. The worker has no DynamoDB, so the server claims before it appends: once per request for async, once per item for batch (today the SQS consumer claims batch items). A failed append releases the claim. |

## Before Part B ships

- The command topic has to exist in staging and production MSK with the exact partition count
  first. `validateBalanceWorkerTopics` refuses to boot without it.
- Confirm the metering topic's retention in MSK is well over 2W.
