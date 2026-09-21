# How other metering companies stop duplicates

Nobody gets exactly-once from the warehouse. Everyone dedupes **before** the store, on an event id, inside a time window. The two that publish their code (OpenMeter, Lago) say outright that the ClickHouse side is at-least-once.

| who | key | window | where | on a duplicate |
|---|---|---|---|---|
| OpenMeter | CloudEvents `source` + `id` | 24h default, 32 days in production | Redis, at the API **and** in the Kafka to ClickHouse sink | dropped silently |
| Stripe | `identifier` | 24h | API edge | v2: 400 `duplicate_meter_event` |
| Orb | `idempotency_key` | the account's grace period (~12h) | API edge | 200, listed as a duplicate |
| Metronome | `transaction_id` | 34 days | ingest | ignored silently |
| m3ter | `uid` | 35 days, on arrival time | accepted, deduped during enrichment | a `DuplicateUid` notice |
| Lago | `transaction_id` | forever on Postgres, eventual on ClickHouse | unique index, or `FINAL` at read time | 422, or accepted and collapsed later |

## The one to copy: OpenMeter's sink

It is Kafka to ClickHouse, the same shape as herald. Each flush (`openmeter/sink/sink.go`):

```
1. dedupe inside the batch
2. MGET the batch's ids from Redis     -> drop any already seen
3. insert into ClickHouse
4. commit the Kafka offsets
5. SET NX the ids in Redis             -> one round trip per flush, not per event
```

If step 5 fails they commit the offset anyway, so a crash costs a possible future duplicate rather than a replay. If both fail they log "consistency failure" and stop. Their ClickHouse table is plain `MergeTree` with **no materialized views**: meters are summed at query time, so they never have our rollup problem.

The catch they hit: claiming an id **before** the write, and not releasing it when the write fails, means the retry is dropped and the event is counted zero times ([PR #5161](https://github.com/openmeterio/openmeter/pull/5161)). Mark ids as seen only **after** a confirmed insert.

## What does not work for us

- **A dedup token on the insert.** ClickPipes sends `topic:partition:firstOffset-lastOffset` and ClickHouse drops the repeat even when the rebuilt batch differs. Tinybird's Events API accepts only `name`, `wait` and `format`. No token.
- **`ReplacingMergeTree` under the rollups.** Tinybird: "Do not build Materialized Views with an AggregatingMergeTree on top of a ReplacingMergeTree. The target Data Source always contains duplicates." A view fires on the inserted block and never sees the collapsed row.
- **`FINAL` at read time.** Lago does this and calls it the thing that "was dominating the ClickHouse cluster CPU". It also cannot fix a rollup that already counted the row twice.

## What this means for herald

A small durable store of event ids, checked before each send to Tinybird and written after Tinybird confirms. Use an id that comes from the log (`topic:partition:offset`), so a replay produces the same id every time. The window has to be longer than the worst replay herald could ever do.
