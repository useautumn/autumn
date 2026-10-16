---
author: tanvir + capy
feature: librdkafka
date: 2026-10-08
status: implementing
---

# Kafka on librdkafka: kafkajs out, `@confluentinc/kafka-javascript` (N-API, patched for Bun) in

kafkajs is unmaintained, cannot do cooperative rebalancing, has no group-less `assign`, and needed a
285-line patch plus a producer thread to stay up under load. This plan moves every Kafka client in
the repo to librdkafka through Confluent's client, on Bun.

## Executive decisions

1. **Library: `@confluentinc/kafka-javascript@1.10.0` from npm + one bun patch.** The patch is
   upstream PR #471 (NAN → N-API, 23 C++ files, taken verbatim from `47334c9`) plus ours (11 files,
   +87/−88): `uv_rwlock_t` → `std::shared_mutex`, `uv_thread_t` → `std::thread`, the two
   `uv_async_t` dispatchers → N-API threadsafe functions. Bun 1.4 implements `uv_mutex_*` only;
   PR #471 alone panics on the first client (`unsupported uv function: uv_rwlock_init`). 1.10.0's
   addon sources are byte-identical to #471's base, so the patch applies to the published tarball and
   no fork has to be hosted. Both halves live in `packages/librdkafka/patches/` for provenance;
   `bun run --cwd packages/librdkafka patch:regenerate` rebuilds the root patch from them.
2. **The addon is built from source, cached, and never needed to import.** `@autumn/librdkafka`
   loads the binding on first client construction, so unit tests and typecheck run without a native
   build. `bun run --cwd packages/librdkafka build` compiles once per (patched sources, platform,
   arch) into `~/.cache/autumn-librdkafka/<key>.node` (~10 min cold, librdkafka statically links its
   own OpenSSL/zstd/curl) and restores it in a second. The Docker image builds it in its own cached
   stage; the runtime image carries one `.node` and no toolchain. The npm package's own install
   script (a prebuilt NAN binary download) never runs: it is not a trusted dependency.
3. **Consumer groups that share work use KIP-848 (`group.protocol=consumer`).** Confluent Cloud
   supports it and recommends it; librdkafka 2.15 has it GA. Local and test Kafka move 3.9.1 → 4.3.1.
   - Balance-worker roster: server-side **`range`** assignor. It co-partitions (metering n, command
     n and the ownership n records go to one worker) the way `coPartitionedAssigner` did, and
     rebalances incrementally: a join or leave moves only the partitions that change hands, every
     other member keeps fetching. Checked under a zombie, join and leave with transactions: exactly
     once, co-partitioned.
   - Herald jobs: server-side **`uniform`**. They need no co-partitioning, and the blue/green swap
     (green joins, blue leaves) no longer stops every member twice.
   - **Lost: client-side assignors.** KIP-848 has none, and librdkafka cannot run a JS assignor
     under the classic protocol either, so `coPartitionedAssigner` and `createLoadAwareAssigner` are
     deleted. Range deals equal partition counts; load-aware dealing is a follow-up (a server-side
     assignor is not available on Confluent Cloud).
   - **Lost: client-set session timeout.** It is the broker's `group.consumer.session.timeout.ms`
     (45 s default, 45 s minimum on Confluent Cloud). A hard-killed worker's partitions wait 45 s
     instead of 30 s for reassignment. A graceful stop is unaffected: leaving is immediate.
4. **The worker's allocation state machine is unchanged.** The consumer reports a group change the
   way kafkajs did: `REBALANCING` (everything revoked) then `GROUP_JOIN` with the full current
   assignment. The handoff protocol already treats a re-assigned partition as A→A (handoff
   cancelled, no bounce), so the incremental protocol gives the group-level win with zero change to
   `partitions/`. Going natively incremental there is a follow-up.
5. **Our own consumer runner on librdkafka's native consumer, not Confluent's KafkaJS shim.** The
   shim's `consumer.on` throws, `heartbeat` is a no-op, `uncommittedOffsets` is not implemented,
   and a throwing `eachBatch` is logged and retried instead of crashing. Every one of those is
   behaviour our consumers depend on (lost-lease detection between slices, crash → rejoin,
   catch-up through transaction markers). `packages/kafka/src/client/librdkafka/` runs batches per
   partition from `consume()`, raises `GROUP_JOIN` / `REBALANCING` / `CRASH` / `FETCH` /
   `END_BATCH_PROCESS`, reports partition EOF as the empty batch kafkajs reported for filtered
   records and markers, and makes `heartbeat()` throw once the batch's partition was revoked.
   Producers and the admin use the shim, which covers what we call.
6. **The producer thread stays; librdkafka runs inside it.** librdkafka encodes, compresses and talks to
   brokers on native threads, but the JS side of a send is not free under Bun: the N-API `produce` call
   per record dominates, and a 20-record idempotent commit costs the calling thread 216 µs (kafkajs:
   215 µs). Moving producers onto the decide thread would hand it the work the thread exists to take
   off. The patched addon loads and produces inside a Bun `Worker`; the thread builds its client with
   `createKafka` and errors cross it as data (code, retriable/fatal flags, cause chain).
7. **A transactional producer fences in `fence()`, never in `connect()`.** librdkafka's
   `init_transactions` (the epoch bump) runs on connect. The session defers the native connect to
   `fence()`, so "the successor never fences before the predecessor has drained" still holds.
8. **Gone with kafkajs:** the 285-line kafkajs patch (re-auth on refusal, request-queue idle timer,
   transaction coordinator cache: librdkafka handles all three), `KafkaWithSettledTopicOffsets`
   (a kafkajs metadata-cache bug), the routine-refusal log lowering (kafkajs-specific messages),
   the boot-time `describeConfigs` check that the ownership topic is compacted (not in the client;
   topic configuration is provisioning's job), and `admin.setOffsets` (herald seeds a new job's
   group with a group-only commit from a non-subscribed consumer instead).

9. **The roster group is renamed once: `${base}-kip848[-${fleetId}]`.** Kafka converts a live classic
   group to KIP-848 only when its members' assignor embeds no custom metadata; kafkajs's load-aware
   assignor does, so new-code workers could never join the fleet's current group. A fresh group is a
   consumer group from its first member, and partitions move into it the way the per-fleet rename moved
   them: the new member prepares, announces `ready`, the old owner drains and writes `claimed{new}`.
   One bounded detour per partition, one time. Herald keeps its groups (they are its committed
   offsets); kafkajs's default assigner embeds nothing, so its groups convert online when the first
   new-code member joins, and convert back if a rollback empties them of new members.
10. **A stuck member is evicted by `max.poll.interval.ms`, set to the group's rebalance timeout.**
    librdkafka heartbeats from its own thread, so a member wedged in a batch (the zombie the fence and
    the handoff protocol exist for) stays in the group until it misses a poll for that long, not for a
    session timeout. Worker and herald keep their 60 s; under KIP-848 it is also how long a member may
    take to give back revoked partitions.
11. **Idle fetches wait at most 500 ms.** librdkafka learns a partition reached its end only from a
    fetch response, so a catch-up waiting to pass a trailing transaction marker hears of it one idle
    fetch later; kafkajs saw markers inside the batch. Tails configured for 5 s waits now fetch every
    500 ms when idle, which costs a few empty fetches a second per consumer.
12. **A partition stays ours until the next poll.** Under KIP-848 the broker hands a revoked partition
    on only after this member acknowledges, which librdkafka does from `consume()`; a batch in flight
    can no longer lose its lease mid-way. `heartbeat()` still throws once the consumer restarted under
    the batch, so a slice handler stops writing then.

13. **Producers linger 1 ms.** A send's records are queued in one tick; librdkafka puts them in one
    record batch (atomic per partition, which `sendIdempotentBatch` relies on) only if it waits for
    them. At 0 ms a 20-record send splits into several requests: single-partition p50 drops from
    2.8 ms to 1.15 ms, but 16 busy partitions commit 35% less (2,500 vs 3,800 commits/s) at twice the
    CPU, and a batch is no longer all-or-nothing. 0.25 and 0.5 ms behave like 0.

## What the benchmarks say

Local Kafka 4.3.1 on loopback, same `@autumn/kafka` calls, kafkajs from `dev` against this branch:

- Hot path is a wash or slightly worse here: idempotent commit p50 2.8 ms vs 0.9 ms on one partition
  (the 1 ms linger), 3.9 vs 3.1 ms across 16; 3,780 vs 4,320 commits/s; JS-thread CPU per commit
  equal; process CPU +54% (librdkafka's own threads). Catch-up reads 134k vs 268k records/s,
  bound by Bun's N-API object creation per record. Loopback has no TLS and no RTT, which is where
  kafkajs's JS sockets cost most; Confluent Cloud is SASL_SSL.
- Startup is far better: a worker's ownership tail is ready in 158 ms instead of 5.0 s (no consumer
  group join barrier), the kafka package's integration tests run 2.6× faster overall.
- Rebalance: KIP-848 moves a partition on the receiving member's next heartbeat, 5 s by default on
  the broker and not settable below it client-side, so moved partitions go dark ~5 s; unmoved ones
  never stop. Locally an eager rebalance is cheap (all members rejoin in ~0.2 s), so eager wins this
  benchmark on dark partition-seconds. We keep KIP-848 for the worker because the ownership handoff
  already keeps serving across a move (the predecessor serves until the successor is ready) and an
  eager rebalance revokes and re-seeks every partition on every member; switching back is
  `groupProtocol: "classic"` in `createConsumerGroupConfig`.

## Rollout

1. Deploy to the green slot as usual. Green workers join the new `-kip848-` group, prepare, and hold at
   the slot gate; the flip hands partitions over through the ownership topic exactly as today.
2. Herald: the flip makes green join the job groups beside blue (online conversion), then blue leaves.
3. Rollback is the flip back: blue (kafkajs) is still in its classic groups, untouched.
4. Local and CI brokers are Kafka 4.3.1. A Capy machine whose broker data was formatted by 3.9 is
   upgraded in place (`kafka-features.sh upgrade`) by `capy-kafka.sh`; a Docker volume from
   `bun dev:services` needs `down --volumes` once.

## Follow-ups

- Natively incremental `partitions/` allocation (no REBALANCING emulation).
- Group-less `assign` for the single-member consumers (ownership tail and replay, partition
  reader, per-process catalog invalidation): no group join at all.
- Load-aware dealing without a client-side assignor.
- Prebuilt addons per arch in CI, if the cached Docker stage is not enough.
