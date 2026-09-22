# Units of work

Thin vertical slices, each ending in a runnable test. One stacked branch per unit (`gh stack`,
base `og/balance-kafka-msk-auth`). Part A ships on its own.

## Part A: the log is the receipt

| # | unit | branch | ends with this passing |
|---|---|---|---|
| 1 | **A window per partition replaces 32 per customer.** `processor/writer/recentCommands/`: two generations, rotated every W. Made in `createPartitionWriterState`, read in `decide`, written in `commit`. The subject map loses `recentCommands`, `rememberCommand`, `readCommand` and goes back to a plain delete. `rejectAllPending` leaves the window alone. One constant for W. | `dedup-window` | unit: a customer's 33rd command still dedupes; forgotten after 2W; kept through recovery and through subject eviction; the `subject-map.test.ts:212` strings unchanged |
| 2 | **The follower remembers.** A per-partition sink from the writer, looked up by partition in the one metering handler. `splitAtBookmark` hands back the records below the bookmark instead of counting them. The handler remembers every record it sees, applied or already applied. | `dedup-replay` | unit: `committer-state-store.test.ts` below-bookmark records come back with their mutation; `kafka-metering-consumer.test.ts` a record applied by replay is a duplicate on retry |
| 3 | **Boot scans the window below the bookmark.** `readPartitionOffsetForTimestamp` in `packages/kafka`, asked once per boot for the whole topic. `startReplay` seeks to `min(offsetAt(now − W), bookmark)`, never below log start. `readResumeOffset` and the `consumeBatch` reconcile let below-bookmark records through. A log shorter than W warns. | `dedup-boot-scan` | integration `postgres/track-commits.test.ts`: track → restart → same command id → 409, the balance moved once. unit: empty partition, a tail of only commit markers, log start above the window |
| 4 | **The idempotency key claim sits in front of the worker path.** `handleTrack` wraps `runBalanceWorkerTrack` in `withIdempotencyKey` with the same key and release rules as `runTrackWithRollout`. The idempotency README gains the worker lane. | `dedup-edge-claim` | `track-body-idempotency.test.ts` on the worker path: success keeps the key and a retry is 409; a 503 releases it. `balanceWorkerWiring.test.ts` updated |

### Unit 1, slices

1. `recentCommands/createRecentCommands.ts` and its type: `remember`, `read`, rotation on read and write from an injected clock. Unit tests.
2. Wire it: `PartitionWriterState`, `decide.ts:76-84`, `commit.ts:130-135`, keep it out of `rejectAllPending`.
3. Remove the old one from `createSubjectMap.ts` and `types/subjectMap.ts`; fix the tests that named it.

### Unit 2, slices

1. `RecentCommands` keys itself from a record: `remember({ mutation })`, `read({ identity, commandId })`.
2. `recentCommands` is a per-partition dependency on the runtime, processor and writer contexts, like `follower`.
3. `createReplay({ partition, recentCommands })`; the handler remembers an applied, duplicate or already-applied record from the record in hand.

### Unit 3, slices

1. `packages/kafka`: `readPartitionOffsetAtTimestamp` beside `readPartitionLogRange`, `-1` means null.
2. `replay/readReplayFloor.ts`: best effort, never throws; `catchUpPartition` seeks to it and publishes it in `replayFloorByPartition` until caught up.
3. The handler: `readResumeOffset` and the already-applied result honour the floor; `onRecordError` skips an unreadable record below the bookmark.
4. The integration test.

## Part B: async track on a command topic

| # | unit | branch | ends with this passing |
|---|---|---|---|
| 5 | **A command topic the server can append to.** `packages/kafka/src/topics/command/` in the metering topic's shape, keyed by `meteringIdentityToPartitionKey`, payload the existing track command. `${deployment}-commands` in env, `setupLocalTopics`, `validateBalanceWorkerTopics`. A plain idempotent producer config (today's needs a `transactionalId`). The server's producer accessor, with the partition set from `meteringIdentityToPartition`. | `command-topic` | kafka integration: the server appends, the record is on the partition the router would pick, and it parses |
| 6 | **The owner consumes its own commands.** One consumer, both topics, a co-partitioning assigner. A command handler feeds `runtime.process` the same way `receiveTrack` does, so one `decide` serves both. | `command-consumer` | kafka + postgres integration: append a track command → the row moves; both topics' partition n land on one member across a rebalance |
| 7 | **A crash never decides a command twice.** Optional `source` on the mutation record. `command_next_offset` on `partition_progress`, written in the same CTE as `next_offset`. After replay the command consumer seeks to it. `sendOffsets` in the mutation's transaction. A command that changes nothing moves the bookmark alone. | `command-bookmark` | integration: stop the worker between the Kafka append and the Postgres commit → restart → decided once. The same command at two offsets → applied once (unit 1's window) |
| 8 | **The server's async track uses it.** On the worker path: claim the key in DynamoDB, append, 202; a failed append releases the claim. Batch track items go the same way with `${ctx.id}-${index}`, each item's key claimed by the server before its append, since the worker has no DynamoDB. | `async-track-worker` | `track-async.test.ts` and the batch idempotency suite on the worker path |

## Status

| unit | state |
|---|---|
| 1 | done, uncommitted. Slice 3 landed with slice 2 since the type change forced it. |
| 2 | done, uncommitted. One `recentCommands` per partition, made in `createWorkerPartitions.createRuntime` and handed to both the writer (through the runtime and processor contexts) and the replay (`createReplay({ partition, recentCommands })`). The record handler looks the set up by partition and remembers every record that landed. Worker unit suite green (496). |
| 3 | done, uncommitted. The replay seeks to `max(logStart, offsetAt(now − W))`, capped at the bookmark; the lookup is best effort (missing call, error, timeout, nothing that recent → bookmark, warn). While the floor is set the handler reads below-bookmark records instead of seeking past them, and one it cannot parse is skipped with a warning instead of failing the partition. `postgres/track-commits.test.ts` proves restart → retry → 409 with the balance moved once. |
| 4 | done, uncommitted. `runBalanceWorkerTrack` wraps its work in `withIdempotencyKey` with the body key and `RouteGroup.Balances`, the way `runTrackWithRollout` does; the handler is untouched. README describes the worker lane. Unit test beside the function's other contracts: no key → no claim; success and 409 keep it; 503 releases it. Not run: the integration body-idempotency suite (needs the dev stack). |
| 5 to 8 | not started |
