---
author: tanvir + capy
feature: balance-worker-handoff
date: 2026-09-24
status: draft, not approved
---

# Partition handoff: the till is never empty

Today ownership is release-then-claim. The old owner stops serving before the new owner can,
and the API has nothing to wait on in between. Measured on Neon (2 workers, 4 partitions,
20 req/s per partition, `apps/balance-worker/tests/benchmarks/ownership-handoff/`):

| transition | partition dark (withdraw → first C2S 200) | client sees |
|---|---|---|
| join, partition changes hands | 1.5s / 1.6s (median / max) | C2S 503 `NO_OWNER` |
| join, partition stays on the same worker | 0.8s / 1.1s | C2S 503 |
| graceful leave (SIGTERM) | 4.0s | C2S 503 |
| hard kill / `bun --watch` save | 34s / 36s | C2S 503 `TRANSPORT` |

Plus a correctness bug: with 170ms DB round trips the successor fences the transactional
producer 66–80ms after the predecessor withdraws, while the predecessor is still committing
accepted tracks. Those fail `OwnedPartitionProducerFencedError` (S2W 500 → C2S 500, not applied;
13 of 94 straddling requests in 6 runs), the predecessor enters recovery, skips its `unowned`
record, and clients keep the stale route (194 × `ROUTE_STILL_STALE`) until the successor claims.

Goal: every sync track during a rolling deploy is C2S 200 in ~20ms, worst case a few hundred ms.
Not in scope: the 30s hard-kill window (session timeout, separate knob) and fewer rebalances
(cooperative assignment, kafkajs cannot; separate plan).

## The protocol

Kafka's consumer group still decides *who* owns a partition. The two workers decide *when*
the switch happens, on the ownership topic they already share (co-partitioned: ownership
partition n carries records about worker partition n).

```
roster assigns p to B                       A keeps serving p throughout
B: prepare p  (read-only: bookmark, replay floor→end into recentCommands, tail the log)
B: publish  ready { p, endpoint: B }
A: sees ready → withdraw route (S2W 409) → drain accepted → publish claimed { p, endpoint: B }
B: sees claimed naming itself → fence producer → catch up bookmark→end (≈ nothing) → admit with that record's offset as routeEpoch
API: 409 from A → refresh → owner table already says B → resend → B → C2S 200
```

One new record type (`ready`). `claimed` is reused: the predecessor writes it on the successor's
behalf. The API's owner table needs no change: a later `claimed` supersedes an earlier one
(`packages/kafka/src/topics/ownership/consumer/ownershipReplay.ts:44-49`). `unowned` stays for
a stop with no successor.

### Ordering invariants

1. B never fences before A has drained. Fencing kills A's pen; A must have nothing left to write.
   A's `claimed{B}` is written after its drain, and B fences only on seeing it.
2. B never writes Postgres during preparation. The preparation follower only rebuilds
   `recentCommands` (dedup window); Postgres rows and the bookmark stay A's until handoff.
   After handoff, B's catch-up applies bookmark→end, which A's drain has already left empty.
3. Route epoch ordering is the `claimed` record's offset, as today. A's directory entry keeps
   A's epoch until A withdraws; B admits with the new one.
4. A→A (the roster hands a partition back to the same worker): no handoff, no bounce. The
   entry stays admitted; only the follower's consumer position is re-established.

### Fallbacks (never wedge, degrade to today's behaviour)

| situation | what happens |
|---|---|
| no `ready` within `HANDOFF_READY_TIMEOUT_MS` (5s) after revoke | A withdraws, drains, publishes `unowned` (today's path) |
| no `claimed{B}` within `HANDOFF_CLAIM_TIMEOUT_MS` (3s) after B's `ready` | B fences and claims itself (today's path; A is dead or stuck, its pen dies with the fence) |
| A's drain fails | A publishes `unowned` if it can, enters recovery as today; B falls through to self-claim |
| SIGTERM (`worker.stop()`) | leave the group first so successors get assigned and prepare; serve until `ready` per partition or the timeout; must fit ECS stopTimeout (30s default) |

## Where it lives

### `packages/kafka` ownership topic

- `types/ownershipRecord.ts`: add `readyOwnershipRecordSchema` `{ schemaVersion: 1, type: "ready", partition, endpoint, readyAt }`.
- `publisher/`: `announceReady` beside `claimPartition` / `releasePartition`; `claimPartition`
  takes the endpoint to name (defaults to self) so A can write `claimed{B}`.
- `consumer/ownershipReplay.ts`: `ready` is a no-op for the owner table (API servers ignore it).
- New: a per-partition tail reader for workers, built on `consumer/reader/consumePartitionRange.ts`
  / `readPartitionRange.ts` (no consumer group): `tailOwnershipPartition({ partition, fromOffset, onRecord, signal })`.
  Workers only ever read the tail of their own partitions, so the uncompacted log size does not matter.

### `apps/balance-worker/src/partitions/`

State machine per entry, replacing detach-on-revoke:

```
assigned ──► preparing ──► ready-announced ──► activating ──► admitted
                                   │ claim timeout                 │ revoke
                                   └──► self-claim (today)         ▼
                                                            handing-off ──► ready seen ──► withdrawn → drained → claimed{B} published → stopped
                                                                   │ ready timeout
                                                                   └──► unowned (today)
                                                            re-assigned to self ──► admitted (cancel handoff)
```

- `allocation/partitionAllocation.ts`: `revokePartitionAllocation` moves entries to
  `state.handingOff` instead of `detachPartitions`; `applyPartitionAllocation` first cancels
  handoffs for partitions in the new assignment, then starts the rest via preparation.
- `lifecycle/partitionStartup.ts` `startPartition`: `runtime.prepare(readOnlyFollower)` →
  `publication.announceReady()` → await `claimed{self}` on the tail (or timeout → `claim()`)
  → `runtime.activate()` → `directory.admit({ routeEpoch })` → `resumeCommands`.
- `lifecycle/stopPartitions.ts`: `retirePartition` gains the "wait for `ready`, then withdraw,
  drain, `claimPartition({ endpoint: successor })`" branch; existing release path is the fallback.
- `types/partitions.ts`: `PartitionOwnershipPublication` gains `announceReady()` and
  `claim({ endpoint? })`; `PartitionRuntimeResources` gains the ownership tail subscription.
- `partitionService.ts` stop order: `consumer.stop()` (LeaveGroup) before retiring entries.
  Needs checking that kafkajs leaving the group does not tear down the per-partition producers.

### `apps/balance-worker/src/runtime/`

- `lifecycle/startRuntime.ts` `prepareRuntime` already requires a separate read-only follower;
  `completeRuntimePreparation` must not call `bootstrapper.bootstrap` with a Postgres-writing
  store. Add a preparation mode to `createMeteringRecordHandler` that only feeds
  `recentCommands` and tracks positions (`state/` untouched).
- `lifecycle/startupSteps.ts` `completeRuntimeStartup` from `prepared`: connect + fence, then
  `startAndCatchUp` from the bookmark (skip the bootstrap plan; the store is already current).
- `processCommand.ts`: while status is `activating`, wait (bounded, e.g. 500ms) instead of
  throwing `OwnedPartitionNotReadyError`, so a request the API resent to B during fence + catch-up
  is served rather than S2W NOT_READY.
- `partitions` A→A: keep the runtime; re-establish the follower's consumer position through
  `createMeteringRecordHandler.readResumeOffset` (bookmark) without stop/start. Verify.

### `packages/balance-worker-client`

No change required for the happy path: A writes `claimed{B}` before withdrawing, so the
S2W 409 → `refreshCommandRoute` → resend already finds B. Optional hardening: on 409 from
epoch X, refresh until `owners.findOwner(p).routeEpoch > X` or the 200ms cap.

## Timeline after the change (Neon numbers)

| step | cost | on the customer's clock? |
|---|---|---|
| A hears about the rebalance | ≤3s | no, A keeps serving |
| B prepares (replay floor→end) | ~0.5–0.8s | no |
| A drains accepted tracks | ≤ one track latency (~170ms) | only for tracks that arrive at A after withdraw: they take the 409 → resend detour |
| B fence + catch-up + admit | ~50–100ms | requests resent to B wait at the gate |
| worst case for one track | ~300ms | C2S 200 |

## Proof

- Unit: `tests/unit/partitions/kafka-owned-partition-group.test.ts` gains the state machine
  cases (ready seen, ready timeout, claim timeout, A→A cancel, stop order).
- Integration: `tests/integration/kafka/ownership-admission.test.ts` extended with join and
  leave under a track hammer; assertion is zero non-200 and every track applied exactly once.
- Benchmark: `tests/benchmarks/ownership-handoff/` rerun; JOIN and LEAVE rows must read 0
  failures, longest failure run 0ms; the 13 × 500 must be gone.

## Open questions

1. Does kafkajs keep a revoked partition's fetch position sane for the A→A case, or must the
   follower be restarted anyway (then A→A still bounces, just without fencing)?
2. Ownership tail reader per partition means one extra Kafka fetch stream per owned partition
   (512 in prod). Cheap, but confirm against the broker connection budget the plans already worry about.
3. `HANDOFF_READY_TIMEOUT_MS` vs ECS stopTimeout on the Flightcontrol service (unknown, default 30s).

## Decisions

Recorded while implementing (2026-09-24, PR "feat(kafka)+feat(balance-worker): partition handoff").

- **One ownership tail per worker, not per partition** (open question 2). kafkajs has no group-less
  `assign`; every `kafka.consumer()` is its own cluster and group join, so a per-partition tail is
  256 joins at once on a prod revoke. `createOwnershipTail` runs one consumer per worker from the
  log end; `tailPartition` is an in-memory listener. `fromOffset` is unnecessary: a listener is
  always registered before the record it waits for can exist.
- **A→A keeps its runtime and its follower** (open question 1). kafkajs rebuilds its offset manager
  on every join and the topic consumer re-runs `readResumeOffset` on the first batch after GROUP_JOIN,
  so the kept partition seeks back to its bookmark on its own. The worker only skips the assignment
  pause for kept partitions.
- **Ready timeout vs stopTimeout** (open question 3): prod stopTimeout is 90s; 5s per wave fits.
- **Hold-then-409.** Invariant 1 wins over the client paragraph: A writes `claimed{B}` *after* its
  drain, so a request that reaches A between withdraw and that claim is held (`awaitHandoff`) and
  answered 409 only once the claim is durable; the client's refresh then finds B. The sentence "A
  writes `claimed{B}` before withdrawing" in the client section is wrong.
- **Drain includes the store apply.** A "log"-durability reply lands before its Postgres apply;
  `processor.drain()` now also waits for the writer's store completion, otherwise B loads a bookmark
  A is still advancing and its first flush conflicts (seen in the first benchmark run).
- **Activation re-runs `bootstrap` and starts the follower at the bookmark.** For postgres the
  bootstrap *is* the `loadProgress` read of the bookmark A just advanced; skipping it would replay
  against a stale mirror. The window below the bookmark is not re-read: preparation already rebuilt
  the dedup window.
- **Preparation tolerates `local_state_ahead_of_log_end`** and re-reads the log end: the owner is
  live and its bookmark can pass a log end read a moment earlier. Preparation still calls
  `bootstrap`; for postgres that is a read except on a never-bookmarked partition.
- **`ready` goes through a plain idempotent producer**, not the partition's transactional one,
  whose first transaction is the fence.
- **When to announce `ready` is a hook**, `PartitionsDependencies.awaitReadyAnnouncement`
  (default: as soon as prepared). Blue-green will drive it from the slot switch; the protocol itself
  never consults group membership.
- **Blue-green flag, unchanged here:** `packages/env` derives the group id, every topic name and the
  transactional-id prefix from the single `BALANCE_WORKER_DEPLOYMENT` string
  (`balanceWorkerDeployment.ts`, `workerConfig.ts createWorkerProducerConfig`). Blue-green needs
  group id = deployment + slot while topics and transactional ids stay deployment-only, so the two
  fleets share the log and the fence but not the roster.
- **Benchmark harness:** a partition that stays with its owner no longer writes an ownership record,
  so `settled()` keys on the roster settling plus a 200 per partition after the last activity;
  startup rows gained prepare / announce→activate / activate columns.
