# Units of work

Thin slices, each ending in a test that runs.

| # | unit | ends with this passing |
|---|---|---|
| 1 | **The record carries what an event needs.** The subject's internal ids on the mutation; per balance touched, its feature, plan and reset on the track and finalize result, plus the plan that paid the most. | engine unit tests |
| 2 | **Herald exists and writes track events to Postgres.** `apps/herald`, one Kafka consumer group, event id `topic:partition:offset`, `ON CONFLICT DO NOTHING`, commit the offset after the insert. Started by `bun dw`. | `track-basic` with the events assertion on |
| 3 | **Lock and finalize events.** Lock: `+value`. Finalize: `final - lock`, nothing when they are equal, the lock's properties unless overridden. `confirmExpiredLock`: nothing. | `check-with-lock-release`, `-refund`, `-additional-deduct`, `-properties`, `-expiry` 2 |
| 4 | **Tinybird, in the same job.** One event, built once, goes to both stores: send the batch to Tinybird (`wait=true`), insert it into Postgres, commit the offset. No sent-marker. A crash before the commit resends that one batch to Tinybird; Postgres skips it by id. | `track-deductions-G` |
| 5 | **Track webhooks.** Threshold reached, usage alerts, limit reached. Needs balances before and after on the record. | `track/limit-reached/*`, `track/usage-alerts/*` |
| 6 | **Ship it.** Dockerfile line, the launch script in `server/package.json`, CI. | deploys to staging |

## Decided

- Appending to the log is final. Herald trusts it.
- Herald keeps its place with Kafka's committed offsets. Postgres absorbs a replay through the event id; Tinybird can get one batch twice after a crash.
- One consumer group for the events job. Webhooks and caches get their own when they are built.
- One event can never fail its batch: a duplicate is skipped by id, and a row Postgres refuses is split out, logged (`herald_usage_event_refused`) and left behind.
- A job with no saved place starts at the newest record. A record herald cannot read is logged (`herald_record_skipped`) and skipped.
- Scaling is more copies of herald in the same consumer group; Kafka splits the 512 partitions between them.

## Parked for the end (balance worker, not herald)

- The same `commandId` applying twice after a restart.
- A lock id reused across two customers, and a customer deleted mid-flight: the two ways Postgres can refuse a record today.
