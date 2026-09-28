---
author: john + capy
feature: balance-worker-track-throughput
date: 2026-09-25
status: plan — phase 1 not started; queued-consumer pipelining agreed
---

# Track throughput on the balance worker

Goal: 5x track throughput per worker, or 5x less processing time per track.

There are two separate limits:

1. **CPU per track.** One JS thread per worker spends ~0.9–1.2ms of CPU on a typical track. The
   balance math itself is ~6% of that.
2. **Queued tracks go through one at a time per partition.** The command consumer awaits each
   record's commit before it hands the writer the next one, so queued tracks never batch.

## Benchmark

Harness: `apps/balance-worker/tests/benchmarks/track-throughput/`. It runs the real partition
processor on the Postgres (map-baseline) store with real Kafka serialization; Kafka and Postgres
latency are simulated.

```sh
cd apps/balance-worker
bun --config=./bunfig.toml tests/benchmarks/track-throughput/run.ts \
  --scenario=typical --mode=http|hono|queued --appendMs=0 --applyMs=0
```

Scenarios: `small` = 1 entitlement, `typical` = 2 plans × 6 features, `heavy` = 4 plans × 15 features.

| scenario | baseline | with the phase-1 prototype |
|---|---|---|
| small | 2,973/s · 590µs | 7,091/s · 312µs |
| typical | 1,550/s · 899µs | 3,619/s · 479µs |
| heavy | 531/s · 2,393µs | 1,316/s · 1,145µs |
| typical, through the Hono app and logger | 1,289/s · 1,223µs | 2,226/s · 840µs |
| queued (8ms Kafka, 15ms Postgres) | 35/s per partition, p50 28.6ms | unchanged |

Where the baseline CPU goes (typical):

```
track ─┬─ catalog read re-parses every row with zod, 4–5× per track     29%
       ├─ full subject rebuilt 4× (reset inputs, reset, before, after)   ~10% beyond catalog
       ├─ webhook effects: 2 extra full deductions (limit reached)      14.5%
       ├─ other zod: track parsed twice, mutation/check/Kafka parses    ~10%
       └─ the track deduction itself                                    ~6%
HTTP   ─┬─ reply carries state + catalog: 12KB typical, 50KB heavy
        └─ request log deep-walks each event (normalizeErrorValues)     ~8%
```

## Phase 1 — CPU quick wins (prototype measured 2.3–2.5x)

- Parse catalog rows once when they enter `catalog-lru` (put/load), not on every `readCatalog`.
- Keep zod only where data enters the worker (HTTP body, Kafka consume). Remove it from objects the
  worker built itself: the second `parseTrackCommand` in `processor/commands/track.ts`,
  `parseSubjectStateMutation` in `trackOutcomeToMutation` / `computeReset`, `parseCheckCommand` in
  `mutationToCheckCommand`, and `parseMutationRecord` in `serializeMeteringRecord`.
- Build each state's full subject and catalog once (states are immutable, so key them by state
  object), not 4× per track.
- `checkLimitReached`: check the after-track state first and skip the before check when it's still
  allowed. The result is the same and saves one full deduction per track.

## Phase 2 — structural CPU

- A track only changes balances, so the catalog carries from `state` to `nextState` without re-reading it.
- Skip `ensureSubjectCatalog` / `ensureCatalogForState` for subjects already resident and fresh;
  memoize catalog keys per state.
- Replace `decimal.js` in the hot path with native-number helpers (~6–8% after phase 1).
- Slim `TrackReply` to what the server reads; today it carries the full state and catalog.
  This changes the server/worker protocol.
- Make the request log a flat event so `normalizeErrorValues` doesn't deep-walk it.

## Phase 3 — pipelining (wall throughput)

### Queued-track consumer (agreed)

Queued and sync tracks go through the same writer and batches. The difference is how many tracks
reach the writer at once:

```
sync:    HTTP req 1 ─┐
         HTTP req 2 ─┼─► writer queue [1,2,…,100] ──► one Kafka batch
         HTTP req … ─┘   (concurrent arrivals)

queued:  consumeBatch (packages/kafka/src/consumer/consumeBatch.ts)
           for record in batch:
             await applyRecord(record)   ← resolves only after this track's commit
           ─► writer queue [1] ──► Kafka batch of 1 ──► Postgres ──► then record 2 enters
```

With only queued traffic, every batch is one track and a partition drains at about one track per
(Kafka + Postgres) round trip. One customer's queued tracks all go to one partition.

Change: let the command consumer hand the writer records back to back without waiting on each
commit, so they fill a batch the way concurrent HTTP requests do. Constraints:

- Records keep offset order when they reach the writer (decide order = record order).
- The command offset (Kafka `sendOffsets` and the Postgres `command_next_offset`) only moves
  forward over a contiguous run of records whose commits have all landed, so a crash never skips
  an undecided record.
- Keep a cap on how many records are in flight per partition (writer `maxPendingCommands`).
- Idempotency claims in `consumeTrack` (DynamoDB) must not serialize the pipeline either.

### Writer commit loop

`commitOutcomes` waits for the Postgres apply of batch N before it appends batch N+1 to Kafka.
Append N+1 while N applies. Applies stay ordered per partition, and a failed apply still puts the
partition into recovery. The per-batch cost drops to about the Kafka round trip for sync and
queued tracks alike.

## Out of scope

- Prepared statements: hydration is cold-only, the committer flush is one dynamic CTE per batch,
  and `prepare` is off because of PgBouncer transaction pooling. The Postgres apply only costs
  throughput because the writer waits on it (fixed above).

## Before phase 3

Pull the `kafka_commit` / `store_apply` commit-phase events from Axiom (`batchSize`, per-phase
durations) for the busiest partitions to replace the simulated latencies with prod numbers.
