# Base architecture: the durable log

First-principles design for the substrate. Not Autumn-specific. Goal: pick the thing that can be the source of truth for ~1M events/s, then be honest about what that thing cannot do.

## What we need

| | Requirement | Notes |
| --- | --- | --- |
| A | Extreme throughput | Target ~1M appends/s, bursty, many producers |
| B | FIFO | Order must be defined *somewhere*. Global FIFO at 1M/s is not real. |
| C | Durable replay | If every worker and cache dies, we can rebuild from the log |
| D | Insert / mutate "in between" | Late events, corrections, backfills, effective-dated grants |

A, B, C are one product category. D is a different problem and fights naive FIFO. The architecture has to hold both without lying about either.

## Log, not queue

A **queue** (SQS, Rabbit, NATS-core) delivers a message to one consumer and then forgets it. That fails C. You cannot replay a queue. You cannot have Tinybird *and* a balance worker *and* a billing projector read the same history.

A **log** (Kafka, Redpanda, WarpStream, Pulsar, Kinesis) appends, retains, and lets any number of consumers replay from an offset. The message stays. That is the SoT shape.

So: durable **log**, not durable **queue**. FIFO is per partition, not "a single global queue." People say Kafka when they mean this category.

```text
producers  ──append──►  log (replicated, retained)
                          │
                          ├── consumer: analytics     (own offset)
                          ├── consumer: apply/wallet  (own offset)
                          └── consumer: audit/rebuild (own offset)
```

A consumer crashing does not delete events. It just stops moving its offset. That is C.

## A — throughput

Sequential append to partitioned disks (or object storage) is how you get 1M/s. Random writes to a serving store (Redis hashes, Postgres rows, worker memory) are not.

Rules that make A true:

- **Partition.** Parallel appends. Throughput ≈ partitions × per-partition append rate.
- **Batch produce.** API never does one network write per event at 1M/s. Batch 1–10ms or N records.
- **Small records.** Intent: id, customer, feature, value, event_time, properties ref. Fat payloads kill 1M/s.
- **No read-on-write in the log.** The log does not compute remaining. It accepts bytes.

If a write has to "read remaining, decide, then write," that write is not on the 1M/s path. It is on an apply path with a much lower rate.

## B — FIFO, but of what?

Total order of all events on earth does not exist at this scale. What you can have:

| Scope | Guaranteed? | Use |
| --- | --- | --- |
| One partition | Yes. Append order = offset order | The only FIFO the log actually gives you |
| One customer | Yes, **if** all of that customer's events share a partition key | Wallet apply, per-customer replay |
| One feature of one customer | Yes, finer key | Breaks if two features share a credit pool |
| Whole org / global | No | Do not design remaining around this |

**Partition key for a wallet:** the unit that must be applied serially. Usually `customer` (or `org+customer`). Not `feature`, if features can drain each other. Not `event_id`.

**Two clocks, always:**

- `ingest_time` / offset — when the log accepted it. Immutable. This is B.
- `event_time` — when the business says it happened. This is how D is expressed. May be in the past.

FIFO of *ingest* is what the log guarantees. FIFO of *event_time* is something you reconstruct on read or in the apply engine. They diverge the moment an event is late.

If you force "apply in event_time order" on the hot path, a late event means you rewind remaining and replay everything after it. That is incompatible with 1M/s real-time remaining unless you restrict it to a short grace window.

## C — durable replay

Minimum bar for "this log is SoT":

1. **Replication** before ack (quorum). Producer `acks=all` (or equivalent). A 202 to the client means "on the log," not "in a producer buffer."
2. **Retention longer than the oldest snapshot you will recover from.** Seven days of log + hourly snapshots is a system. Seven days of log and no snapshots is a hope.
3. **No compaction on the intent log.** Compaction keeps the latest value per key. That deletes history. Compaction is for a *snapshot/changelog* topic, not for the SoT.
4. **Idempotent produce** (`event_id` as producer key / idempotency). Retry must not create a second SoT event.
5. **Snapshots of derived state** (`snapshot(S)` watermarked with offset `S`). Replay is tail, not genesis, except for audit.

Replay formula (unchanged):

```text
snapshot(S) + fold(log offsets > S) = state
```

The fold function depends on event type. Usage intents and remaining facts are different folds. The log just has to still be there.

## D — you do not insert into a log

This is the important constraint.

A durable high-throughput log is **append-only**. You cannot splice a record between offset 40 and 41. You cannot edit offset 40. Kafka, Redpanda, Pulsar, Kinesis, Redis Streams: all the same here. That immutability is why C works. If you can rewrite history, every consumer's offset is a lie.

"Insert / mutate events in between times" is a real product need. It is **not** a log-mutate need. There are three legitimate ways to get it.

### D1. Compensating events (ledger style)

Wrong value was 5; should have been 3:

```text
offset 40  UsageRecorded   { id: evt_1, value: 5, event_time: T }
offset 90  UsageCorrected  { id: evt_1, value: 3, event_time: T }   // or Retracted + new
```

The log stays append-only. Replay at the tip sees the correction. Audit still sees the mistake. This is how money systems work.

Use for: admin edits, duplicate retraction, "customer says that track was wrong."

### D2. Event-time, not offset-time (meter style)

Late event: happened at 14:00, arrived at 16:00.

```text
offset 9000  UsageRecorded { id: evt_9, value: 2, event_time: 14:00, ingest_time: 16:00 }
```

Analytics / invoices **sort or query by `event_time`**. The event is "inserted" into Tuesday's usage without rewriting Monday's log. This is how Orb-style meters work: the SoT is the set of events, the bill is a query over `event_time`.

Use for: late SDK flushes, backfills, "this hour was missing, here is the file."

Backfill is the same: append a million records with old `event_time`. Do not splice them into last week's offsets.

### D3. Pending window, then commit (wallet + late data)

If remaining must move *as of event_time* (not as of ingest), you cannot finalize remaining at ingest.

```text
ingest  →  pending for grace (e.g. 15m–24h)
        →  late events still enter that window
        →  commit remaining / ledger lines for the window
```

Inside the window, "insert in between" is just another pending row. After commit, only D1 (compensation) is allowed.

Use for: prepaid remaining that must match billed usage, grace for mobile / batch exporters.

### What we will not do

- Update-in-place on the log.
- "Delete event 40 and rewrite the topic."
- Treat Tinybird / ClickHouse `ALTER` as the SoT write path.
- Recompute all remaining from genesis on every late event.

If a late event must change *already-served* remaining (check already said `allowed: true` at 15:00), that is a business choice: apply the late event as of *now* (remaining moves now, history of decisions stays), or rewind a window (expensive, rare). The log does not make that choice for you. It only records both the late intent and the apply fact.

## Recommended substrate

**Category: Kafka-protocol durable log.**

| System | Why consider | Why not |
| --- | --- | --- |
| Apache Kafka | Default, huge ecosystem, tiered storage | Ops weight |
| Redpanda | Same API, lower latency, simpler ops | Smaller ecosystem |
| WarpStream / S3-backed | Cheap long retention (C), 1M/s ingest (A) | Higher produce latency; bad if 202 must be <10ms everywhere |
| Pulsar | Cursors, geo, queue+log | More moving parts |
| Kinesis | If we want AWS-native | Shard math, cost, weaker multi-consumer story |
| Redis Streams | Nice per-customer WAL, `XADD` local | Wrong global 1M/s bus; memory; not the SoT |
| SQS / Rabbit | — | Queue. Fails C |

**Pick: one Kafka-API log as the ingest SoT.** Implementation (Kafka vs Redpanda vs WarpStream) is an ops/latency/cost choice, not an architecture choice. Do not pick Redis Streams or SQS for this layer.

Topics (minimum):

```text
usage.intents.v1        key=customer_id     retention long, no compaction     1M/s
wallet.facts.v1         key=customer_id     retention long, no compaction     apply rate
wallet.snapshots.v1     key=customer_id     compacted                         remaining checkpoints
```

- **intents:** what the world said happened (`event_time`, `value`, `properties`, `event_id`).
- **facts:** what the apply engine did to remaining (bucket deltas, `applied_offset` / `subject_seq`).
- **snapshots:** `remaining @ offset S` so replay is a tail.

Analytics reads `usage.intents`. Wallet rebuild reads `wallet.snapshots` + `wallet.facts`. You can emit facts onto a compact changelog and still keep intents forever.

## How A–D sit together

```text
                    event_time may be in the past
                              │
producers ──► usage.intents   │   append only, FIFO per customer
                    │         ▼
                    ├──► analytics (query / sort by event_time)      ← D2
                    │
                    └──► apply worker (per customer partition)
                              │
                              ├── coalesce window
                              ├── deduct once
                              ├── append wallet.facts                  ← D1 lives here too
                              └── write serving projection (cache)
                                        │
                                        ▼
                                   real-time remaining reads
```

- **A:** append to `usage.intents` is the 1M/s path. No remaining math.
- **B:** per-customer partition key. Apply sees a FIFO of that customer's intents.
- **C:** retain intents + facts; compact only snapshots; ack after quorum; recover from snapshot + tail.
- **D:** never splice the log. Late/backfill = new append with old `event_time`. Wrong value = compensating append. Wallet grace = pending until commit.

## Decisions to lock before the next layer

1. **Partition key** = customer (or org+customer). Confirm nothing must be serial across customers.
2. **Ack contract.** Is 202 = "on the log" (required for SoT) or "in our memory and we'll produce later"?
3. **Late-event policy for remaining.** Apply-as-now vs pending-window vs rewind. Analytics can always use D2; remaining cannot do all three at 1M/s.
4. **Idempotency key** = `event_id` (client or server). Unique per `(org, env, customer, event_id)`.
5. **Retention vs snapshot interval.** Example: 7–30d hot log, snapshots every 1–5 min per active customer, cold intents on object storage.

S2 as a candidate substrate (not a default): [02-s2-vs-kafka.md](./02-s2-vs-kafka.md). Same log category as Kafka; different resource model (unlimited streams, fencing). Not a drop-in for the analytics firehose.

Next design layer (not this doc): the apply engine and the serving projection. Those sit *on* this log. They are not the log.
