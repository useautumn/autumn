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
6. **The producer thread is deleted.** It existed to keep kafkajs's encoding, compression and
   socket work off the decide thread. librdkafka already does all three on its own native threads;
   the thread added a ring copy, a frame decode and a `postMessage` per send. Producers run on the
   decide thread; the idempotent-only assertion stays.
7. **A transactional producer fences in `fence()`, never in `connect()`.** librdkafka's
   `init_transactions` (the epoch bump) runs on connect. The session defers the native connect to
   `fence()`, so "the successor never fences before the predecessor has drained" still holds.
8. **Gone with kafkajs:** the 285-line kafkajs patch (re-auth on refusal, request-queue idle timer,
   transaction coordinator cache: librdkafka handles all three), `KafkaWithSettledTopicOffsets`
   (a kafkajs metadata-cache bug), the routine-refusal log lowering (kafkajs-specific messages),
   the boot-time `describeConfigs` check that the ownership topic is compacted (not in the client;
   topic configuration is provisioning's job), and `admin.setOffsets` (herald seeds a new job's
   group with a group-only commit from a non-subscribed consumer instead).

## Follow-ups

- Natively incremental `partitions/` allocation (no REBALANCING emulation).
- Group-less `assign` for the single-member consumers (ownership tail and replay, partition
  reader, per-process catalog invalidation): no group join at all.
- Load-aware dealing without a client-side assignor.
- Prebuilt addons per arch in CI, if the cached Docker stage is not enough.
