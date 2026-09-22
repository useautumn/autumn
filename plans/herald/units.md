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

## Parked: `customer.threshold_reached`

The old event (`handleThresholdReached`, deprecated) fires only for orgs on API < 2.1 and carries a
full `ApiCustomer` rendered at that org's version. Herald does not send it: the record has no API
version, and the payload needs the whole customer render. Options:

1. Do not port it. Before the worker rollout reaches an org, check its Svix endpoints for a
   `customer.threshold_reached` subscription (`packages/svix` `endpointsSubscribeToEvent`) and keep
   such orgs on the legacy path until they move to `balances.limit_reached`.
2. Port it: stamp the org's API version on the record and render the customer from `after` with
   the shared renderers. Doable, but it keeps a deprecated event alive on the new path.

Decided (2026-09-22): option 1, parked. Not ported; the rollout gate must exclude orgs whose Svix
endpoints subscribe to `customer.threshold_reached` until they move to `balances.limit_reached`.
Revisit only if such an org cannot migrate.

## Parked for the end (balance worker, not herald)

- The same `commandId` applying twice after a restart.
- A lock id reused across two customers, and a customer deleted mid-flight: the two ways Postgres can refuse a record today.
