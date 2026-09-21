---
author: john + claude
feature: herald
date: 2026-09-21
status: ready-for-review
---

# Herald: a service that reads the balance log and tells everyone else

`apps/herald` reads the balance worker's Kafka log and fans each record out to the jobs that need it. The first job writes usage events to Tinybird. Later jobs push updates to customers' caches.

## What's inside

- `data-model/what-a-usage-event-is-today.md` — the event row, the two stores it goes to, and exactly what a track, a lock and a finalize write.
- `units.md` — the ordered units of work, and what is decided and parked.
- `how-others-stop-duplicates.md` — OpenMeter, Stripe, Orb, Metronome, m3ter, Lago: everyone dedupes before the store, on an event id, inside a window.
- `data-model/what-is-on-the-log.md` — *(next)* the record herald will read, and the three things it does not tell you.
- `code-paths/how-an-event-is-written-today.md` — *(next)* request to Tinybird, and where events get lost or doubled.
- `code-paths/how-the-log-is-read-today.md` — *(next)* the consumer code that already exists, and how a service is built and shipped here.

## Can Tinybird give exactly-once? No. Effectively-once, yes.

Tinybird's docs: "The Events API isn't idempotent. Sending the same data more than once inserts it multiple times." There is no idempotency header and no dedup token. A retried 500 or a client timeout is a duplicate nobody can detect.

```
 (a) idempotent sink              (b) offset stored with the output
 redeliver -> same id             commit(offset) and the write land
 -> the sink collapses it         in ONE transaction
     works on Tinybird                impossible on Tinybird
```

Our Postgres committer uses (b): the bookmark moves in the same transaction as the rows. Tinybird has no transaction to join, so herald gets (a): deliver at least once, give every row a deterministic id, and collapse duplicates.

The catch: 20 `events_*_mv` rollups fire on each inserted block and never see the collapsed result. A duplicate hidden in the base table stays double-counted in every hourly and daily rollup. Duplicates have to be stopped before they reach Tinybird, not cleaned up inside it.

## Open questions

| # | question | status |
|---|---|---|
| 1 | A record says `applied`, then Postgres refuses it. Nothing marks that. How does herald know not to emit the event? | **settled** — it doesn't. Appending to the log is final, herald trusts it. A Postgres refusal is an anomaly to alert on, never something to correct the log for |
| 2 | The event row needs `internal_customer_id`, `internal_product_id` and per-balance `feature_id` / `plan_id` / `reset`. The record has row ids and deltas. Where does the rest come from? | **settled** — add it to the record: who the subject is (internal ids) on the mutation, what a track touched (plan, feature, reset per balance) on its result |
| 3 | The same `commandId` can be on the log twice, and both really deducted. What is the event's id? | **parked** — a balance worker task for the end, not herald's. Herald emits one event per record |
| 4 | How do duplicates stay out of the rollups? | **settled** — event id from the log, Kafka offsets committed after the write; at worst one batch reaches Tinybird twice after a crash |
| 5 | The tests read events from Postgres, production reads Tinybird. Does herald feed both? | **settled** — both |

## What John has said so far

- **Appending to the log is final.** Postgres is not the source of truth. It should never refuse a record; when it does, that is an anomaly to fix at its cause, and the log is not corrected afterwards.
- **Herald's jobs, so far:** usage events to Tinybird and to Postgres; track webhooks (`fireTrackWebhooks`: threshold reached, usage alerts, limit reached). Later: updates to customers' caches.
- Track webhooks compare the customer **before** and **after** the track, so they need balances from both sides of a record, not only its deltas. Their tests: `balances/track/limit-reached/*`, `balances/track/usage-alerts/*`.

Next: one question at a time, starting with question 1. The remaining research pages get written as each question needs them.
