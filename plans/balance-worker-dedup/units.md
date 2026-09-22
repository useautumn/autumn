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

The server never touches a topic or a partition number. The client package is "how the server
hands a command to a worker", and it gains a second transport beside HTTP:

```
client.track({ command })       HTTP, waits for the reply            exists
client.enqueue({ commands })    Kafka, one append for many commands  unit 5
      └─ partition = meteringIdentityToPartition(command.identity)   same math as resolveCommandRoute
```

The topic carries the engine's mutating command union, so a future command (reset, …) is an engine
variant, a processor method and a consumer case; the transport does not change.

| # | unit | branch | ends with this passing |
|---|---|---|---|
| 5 | **The client can enqueue commands.** `packages/kafka/src/topics/command/` in the metering topic's shape: record = a mutating command, key = `meteringIdentityToPartitionKey`, a plain idempotent producer config beside the transactional one, `appendCommandRecords`. `${deployment}-commands` in env, `setupLocalTopics`, `validateBalanceWorkerTopics`. Client: `queue/enqueueCommands.ts`, `BalanceWorkerClient.enqueue`, a `commandLog` dependency. Server: `external/balanceWorker/getCommandProducer.ts`, injected by `getBalanceWorkerClient`. | `command-enqueue` | unit: the codec round-trips; `enqueue` groups by partition and appends once. kafka integration: `enqueue` two commands for two customers → each record sits on the partition `resolveCommandRoute` would pick, and parses back |
| 6 | **The owner consumes its own commands.** One consumer, both topics, a co-partitioning assigner. A command handler feeds `runtime.process` the same way `receiveTrack` does, dispatching on `command.type`. | `command-consumer` | kafka + postgres integration: enqueue a track → the row moves; both topics' partition n land on one member across a rebalance |
| 7 | **A crash never decides a command twice.** Optional `source` on the mutation record. `command_next_offset` on `partition_progress`, written in the same CTE as `next_offset`. After replay the command consumer seeks to it. `sendOffsets` in the mutation's transaction. A command that changes nothing moves the bookmark alone. | `command-bookmark` | integration: stop the worker between the Kafka append and the Postgres commit → restart → decided once. The same command at two offsets → applied once (Part A) |
| 8 | **Async and batch track use it.** `async: true` on the worker path: claim the key, `enqueue`, 202. Batch: one command per item, `${ctx.id}-${index}` or `["track", key]`, every keyed item claimed in parallel before one `enqueue`; a failed append releases them all. | `async-track-worker` | `track-async.test.ts` and the batch idempotency suite on the worker path |

### Unit 5, slices

1. `packages/kafka`: the command topic (record schema, codec, publisher) and `createIdempotentProducerConfig`. Env name, local setup, boot validation.
2. `packages/balance-worker-client`: `enqueue`, grouping commands by partition; the `CommandLog` port.
3. Server: `getCommandProducer` and the injection. The kafka integration test.

## Status

| unit | state |
|---|---|
| 1 | done, uncommitted. Slice 3 landed with slice 2 since the type change forced it. |
| 2 | done, uncommitted. One `recentCommands` per partition, made in `createWorkerPartitions.createRuntime` and handed to both the writer (through the runtime and processor contexts) and the replay (`createReplay({ partition, recentCommands })`). The record handler looks the set up by partition and remembers every record that landed. Worker unit suite green (496). |
| 3 | done, uncommitted. The replay seeks to `max(logStart, offsetAt(now − W))`, capped at the bookmark; the lookup is best effort (missing call, error, timeout, nothing that recent → bookmark, warn). While the floor is set the handler reads below-bookmark records instead of seeking past them, and one it cannot parse is skipped with a warning instead of failing the partition. `postgres/track-commits.test.ts` proves restart → retry → 409 with the balance moved once. |
| 4 | done, uncommitted. `runBalanceWorkerTrack` wraps its work in `withIdempotencyKey` with the body key and `RouteGroup.Balances`, the way `runTrackWithRollout` does; the handler is untouched. README describes the worker lane. Unit test beside the function's other contracts: no key → no claim; success and 409 keep it; 503 releases it. Not run: the integration body-idempotency suite (needs the dev stack). |
| 5 | done, uncommitted. `client.enqueue({ commands })` → one `producer.send` with a partition per message. Boot validation of the command topic waits for unit 6, when the worker first depends on it; `setupLocalTopics` creates it now. The server connects its producer on the first append, never at boot, and disconnects it on shutdown. Green: kafka unit + `command-topic` integration on the real broker, client unit, env unit; server and worker typecheck. |
| 5b | done, uncommitted. The client grew `queue.track` (a typed door over one `enqueue`; more doors as more commands queue), and a Kafka-backed factory: `createKafkaBalanceWorkerClient({ ctx: { kafka, logger }, config })` → `{ client, start, stop }`, with the ownership reader's start-with-retry and the lazy command producer moved out of the server. The server keeps `getBalanceWorkerClient` / `startBalanceWorkerClient` / `stopBalanceWorkerClient` and an env→connection reader; `getOwnershipConsumer.ts`, `getCommandLog.ts`, `createServerKafka.ts` are gone. Any process (API, SQS workers, cron, the shadow operator) builds the same client. |
| 6 | done, uncommitted. `packages/kafka`: `coPartitionedAssigner` (partition n of every topic → one member), `secondaryTopics` on the topic consumer, topic routing in the metering consumer. Worker: `kafka/commandConsumer/` is the transport (parse the record, find the partition's admitted runtime, dispatch by `command.type`); `consume/` is the business layer, one file per command (`consumeTrack`: a refused or already-applied track is logged and dropped, anything a caller would get a 5xx for is thrown so Kafka redelivers). Command partitions stay paused from assignment until the runtime is admitted. Boot validates the command topic; a bare partition group in tests opts out. `postgres/track-commits.test.ts`: `queue.track` → the row moves; the same id queued again changes nothing. |
| 7 | implemented. Command offsets travel on mutations through an execution-scoped writer; Postgres stores both bookmarks atomically. Commands without mutations use fenced offset completion after prior store writes settle. Verified: crash between Kafka and Postgres, restart seeking, duplicate completion, concurrent HTTP isolation, offset-send failure, codec and SQL unit tests; worker typecheck. Broader architecture review remains deferred. |
| 8 | not started |

### Unit 7 verification

| Case | Assertion |
|---|---|
| Mutation committed to Kafka, worker lost before Postgres | Replay moves both bookmarks; consumption resumes after the command without dedup memory. |
| Kafka group offset ahead or behind Postgres | Admission seeks to the durable command bookmark before fetching, including an empty tail. |
| Duplicate, refusal, unsupported or unreadable command | Fenced offset commit followed by a bookmark-only flush; no balance change. |
| Earlier mutation still applying | Bookmark-only completion waits for the writer's store work. |
| Flush falls back to individual records | Both bookmarks reflect only the applied/refused prefix. |
| Source-less HTTP mutation / old record | Existing parsing and command progress remain unchanged. |
| Offset send fails or producer is fenced | Transaction aborts; command progress never advances. |

Mutation batches send their command offsets in the fenced producer transaction. For commands
without a mutation, completion waits for prior store work, commits the offset through the same
producer session, then flushes only the command bookmark. Postgres remains authoritative.
