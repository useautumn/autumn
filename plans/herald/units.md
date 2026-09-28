# Units of work

Thin slices, each ending in a test that runs.

| # | unit | ends with this passing |
|---|---|---|
| 1 | **The record carries what an event needs.** The subject's internal ids on the mutation; per balance touched, its feature, plan and reset on the track and finalize result, plus the plan that paid the most. | engine unit tests |
| 2 | **Herald exists and writes track events to Postgres.** `apps/herald`, one Kafka consumer group, event id `topic:partition:offset`, `ON CONFLICT DO NOTHING`, commit the offset after the insert. Started by `bun dw`. | `track-basic` with the events assertion on |
| 3 | **Lock and finalize events.** Lock: `+value`. Finalize: `final - lock`, nothing when they are equal, the lock's properties unless overridden. `confirmExpiredLock`: nothing. | `check-with-lock-release`, `-refund`, `-additional-deduct`, `-properties`, `-expiry` 2 |
| 4 | **Tinybird, in the same job.** One event, built once, goes to both stores: send the batch to Tinybird (`wait=true`), insert it into Postgres, commit the offset. No sent-marker. A crash before the commit resends that one batch to Tinybird; Postgres skips it by id. | `track-deductions-G` |
| 5 | **Track webhooks.** Limit reached and usage alerts, decided from the record alone by `packages/balance-webhooks` and sent by herald through `packages/svix`. The record carries the subject as the mutation left it (`after`), the org's ids, config and Svix app ids; the engine rebuilds the before-state. Legacy and herald share the pure half (`wasThresholdCrossed`, measurement, payload, idempotency key). Done: `track/limit-reached/*` 16/16, `track/usage-alerts/*` 15/16 (pooled balances is a worker gap), `lock/finalize-lock-usage-alert` on both paths; see `usage-alerts-matrix.md`. | `track/limit-reached/*`, `track/usage-alerts/*`, `lock/finalize-lock-usage-alert` |
| 6 | **Ship it.** Dockerfile line, the launch script in `server/package.json`, CI. | deploys to staging |

## Decided

- Appending to the log is final. Herald trusts it.
- Herald keeps its place with Kafka's committed offsets. Postgres absorbs a replay through the event id; Tinybird can get one batch twice after a crash.
- One consumer group for the events job. Webhooks and caches get their own when they are built.
- One event can never fail its batch: a duplicate is skipped by id, and a row Postgres refuses is split out, logged (`herald_usage_event_refused`) and left behind.
- A job with no saved place starts at the newest record. A record herald cannot read is logged (`herald_record_skipped`) and skipped.
- Scaling is more copies of herald in the same consumer group; Kafka splits the 512 partitions between them.

## `customer.threshold_reached` on the worker path (API server, not herald)

The old event (`handleThresholdReached`, deprecated) fires only for orgs on API < 2.1 and carries a
full `ApiCustomer` rendered at the request's version. Herald cannot send it (no API version on the
record, whole-customer payload), so the API server sends it from the sync track reply.

2026-09-22 parked it (gate subscribing orgs off the worker). Reversed 2026-09-26: a large live org
subscribes by name and receives it daily, so gating would keep it off the worker.

Design:

- The worker knows nothing of the event: `TrackReply.effects` carries what the decision caused
  (empty on a retry, which never re-decides). The server does the rest, in
  `server/src/internal/balances/trackWebhooks/thresholdReached/`, after responding, API < 2.1 only.
- Crossings are judged at the tracked identity (like `balances.limit_reached`, not legacy's customer total):
  - `limit_reached`: the reply carries a `balances.limit_reached` effect for the feature.
  - `allowance_used`: included balance crosses below one funding unit while overage continues: the
    funding balance (granted − usage) after the track, plus what `result.deltas` took, before it.
    Fires once at the crossing (legacy re-fires on every overage track).
- On a crossing, the server reads the full subject from the worker (the reply holds only the tracked
  feature's rows), renders it at `ctx.apiVersion` and sends.
- Not covered: queued/async tracks (no reply). Legacy `handleThresholdReached` is left as is.

Units: (1) `limit_reached`, (2) `allowance_used`; both done, covered by
`server/tests/integration/billing/autumn-webhooks/threshold-reached/`.

## Parked for the end (balance worker, not herald)

- The same `commandId` applying twice after a restart.
- A lock id reused across two customers, and a customer deleted mid-flight: the two ways Postgres can refuse a record today.
