# When a track is complete

The current Track path has one mutation engine but two caller-visible completion boundaries:

- a **synchronous track** replies after the serving balance has been mutated;
- an **asynchronous track** replies after SQS has accepted the command, before a worker mutates the balance.

Postgres and event persistence happen later in both cases. A successful synchronous response therefore proves more than an asynchronous `202`, but neither response proves that every projection has landed.

## Two tested requests expose the boundary

```text
SYNCHRONOUS · customer starts with 100 messages

request value 1 ──► Redis mutation 100 → 99 ──► HTTP 200, balance 99
                                      │
                                      └──► queued Postgres + event projections

ASYNCHRONOUS · customer starts with 20 messages

request value 3 ──► SQS accepts command ──► HTTP 202, no resolved balance
                              │
                              ▼
                         worker mutation 20 → 17
                              │
                              ├──► queued Postgres + event projections
                              └──► SQS message deletion
```

The synchronous test sees `99` in the Track response and in the cached customer immediately, then sees the same value through an uncached Postgres read after a two-second test wait. [track-basic.test.ts:34](../../../server/tests/integration/balances/track/basic/track-basic.test.ts#L34)

The async route test receives HTTP `202` with the versioned `event_received` placeholder. A separate end-to-end idempotency test starts at `20`, accepts one async Track of `3`, rejects the duplicate before SQS, and polls until the worker-applied balance is `17`. [track-async.test.ts:47](../../../server/tests/balances/track/track-async.test.ts#L47) [track-queue-idempotency.test.ts:107](../../../server/tests/integration/balances/track/idempotency/track-queue-idempotency.test.ts#L107)

## How the API chooses the route

`/events`, `/track`, and `/balances.track` share the same handler. The body names exactly one `feature_id` or `event_name`; value defaults to `1`. An event name expands to every catalog feature that contains that name. [balancesRouter.ts:29](../../../server/src/internal/balances/balancesRouter.ts#L29) [trackParams.ts:17](../../../shared/api/balances/track/trackParams.ts#L17) [getFeatureDeductions.ts:45](../../../server/src/internal/balances/track/utils/getFeatureDeductions.ts#L45)

```text
                           ┌─ body.async / org rollout ─► enqueue ─► 202
validated Track request ───┤
                           └─ normal sync ──────────────► mutate  ─► 200
                                                        │
                                                        └─ transient failure
                                                           enqueue ─► 202
```

The handler resolves the feature deductions before choosing the branch, so an unknown feature or unmapped event name fails before an async command can be queued. Explicit async and org-wide async both call `runAsyncTrack`; the normal route calls the synchronous engine and changes its status to `202` only if it had to queue the request for replay. [handleTrack.ts:25](../../../server/src/internal/balances/handlers/handleTrack.ts#L25)

The async caller waits for the individual SQS send result, not for the worker. Track sends share a dedicated ten-entry, ten-millisecond batch accumulator; each enqueue promise resolves only when its entry appears successful in the SQS batch response. [queueUtils.ts:130](../../../server/src/queue/queueUtils.ts#L130) [queueUtils.ts:221](../../../server/src/queue/queueUtils.ts#L221) [SqsBatchAccumulator.ts:59](../../../server/src/queue/SqsBatchAccumulator.ts#L59)

The queued command keeps the request identity and the original API body:

```text
name: "track"
data:
  orgId
  env
  customerId
  entityId?
  requestId
  apiVersion
  body:
    customer_id
    entity_id?
    feature_id | event_name
    value?
    properties?
    timestamp?
    overage_behavior?
    idempotency_key?
    async?
  validateTrackBodyIdempotencyKey
```

The API serializes that envelope in `queueTrack`; the worker uses `requestId` as its request context, rebuilds feature deductions from the body, and enters the same `runTrackV3` path used synchronously. [queueTrack.ts:56](../../../server/src/internal/balances/track/utils/queueTrack.ts#L56) [processMessage.ts:191](../../../server/src/queue/processMessage.ts#L191) [runQueuedTrack.ts:14](../../../server/src/internal/balances/track/runQueuedTrack.ts#L14)

## What one mutation actually changes

```text
full customer subject
        │
        ├─ requested feature
        ├─ linked credit-system features + conversion costs
        ├─ ordered entitlement and rollover buckets
        ├─ spend and overage controls
        └─ matching usage-window counters
        │
        ▼
one Redis Lua call per requested feature
        │
        ├─ balance / usage / adjustment deltas
        ├─ rollover deltas
        ├─ usage-window snapshots
        ├─ optional lock receipt
        ├─ per-feature replay claim
        └─ mutation log
```

`runTrackV3` loads the full customer or entity subject and carries its view epoch into the deduction. For each requested feature, the preparer selects its direct and credit-system entitlements, applies credit costs and controls, and sorts rollovers by earliest expiry. [runTrackV3.ts:65](../../../server/src/internal/balances/track/v3/runTrackV3.ts#L65) [prepareFeatureDeductionV2.ts:53](../../../server/src/internal/balances/utils/deductionV2/prepareFeatureDeductionV2.ts#L53) [prepareFeatureDeductionV2.ts:216](../../../server/src/internal/balances/utils/deductionV2/prepareFeatureDeductionV2.ts#L216)

The Redis script atomically enforces and changes that feature's relevant balances, usage windows, overage behavior, optional lock, subject epoch, and replay key. Its result is then applied to the in-process `FullSubject`, so the next feature in the same request sees the preceding result. If the view epoch changed, the engine refreshes the subject once and retries that segment. [executeRedisDeductionV2.ts:138](../../../server/src/internal/balances/utils/deductionV2/executeRedisDeductionV2.ts#L138) [executeRedisDeductionV2.ts:198](../../../server/src/internal/balances/utils/deductionV2/executeRedisDeductionV2.ts#L198) [executeRedisDeductionV2.ts:259](../../../server/src/internal/balances/utils/deductionV2/executeRedisDeductionV2.ts#L259)

An `event_name` affecting several features is therefore **a sequence of atomic per-feature mutations**, not one all-feature Redis transaction. Replay state has the same granularity: `(request, customer, feature)`. A partially replayed request skips features already applied and continues with the rest; only a fully duplicated replay becomes the terminal duplicate result. [executeRedisDeductionV2.ts:287](../../../server/src/internal/balances/utils/deductionV2/executeRedisDeductionV2.ts#L287) [track-queue-idempotency.test.ts:331](../../../server/tests/integration/balances/track/idempotency/track-queue-idempotency.test.ts#L331)

## Queue order is not the correctness mechanism

The producer prefers the Standard async-track queue. Standard SQS ignores FIFO group and deduplication fields; while the legacy FIFO queue remains, explicit async Track hashes each request across eight groups for the same customer. Both choices allow same-customer commands to be consumed out of arrival order. [trackAsyncQueueUrls.ts:8](../../../server/src/queue/trackAsyncQueueUrls.ts#L8) [queueUtils.ts:191](../../../server/src/queue/queueUtils.ts#L191) [getAsyncTrackMessageGroupId.ts:3](../../../server/src/internal/balances/track/utils/getAsyncTrackMessageGroupId.ts#L3)

Current concurrent safety instead comes from each customer-rooted Redis script being atomic. In the exercised race, two Tracks of `5` hit the same usage cap of `5`; both requests succeed, but one applies `5`, the other clamps to `0`, and final usage is exactly `5`. [usage-window-enforcement.test.ts:485](../../../server/tests/integration/balances/usage-windows/usage-window-enforcement.test.ts#L485)

Replay safety has two layers:

- a body idempotency key is claimed at API acceptance and retained after success, so a caller retry receives `409`; [track-body-idempotency.test.ts:22](../../../server/tests/integration/balances/track/idempotency/track-body-idempotency.test.ts#L22)
- every queued delivery also uses a Redis key scoped to request, customer, and feature for about 24 hours, so SQS redelivery does not deduct twice. [track-queue-idempotency.test.ts:40](../../../server/tests/integration/balances/track/idempotency/track-queue-idempotency.test.ts#L40) [track-queue-idempotency.test.ts:177](../../../server/tests/integration/balances/track/idempotency/track-queue-idempotency.test.ts#L177)

## What gets persisted after the serving mutation

```text
Redis mutation is complete
        │
        ├─ balance sync manager · per-customer 1s batch
        │      └─ SQS sync job ─► read latest Redis hashes ─► sync_balances_v2 ─► Postgres
        │
        ├─ event manager · 350ms or 200 events
        │      ├─ SQS event batch ─► events database
        │      └─ direct Tinybird ingest
        │
        └─ response / Track worker returns without awaiting either manager
```

The balance sync manager merges changed entitlement IDs, rollover IDs, and last-write-wins usage-window snapshots for each customer for one second. With coalescing enabled, it writes a customer dirty record and signals a drain; that drain waits a further one-second coalescing window, reads the latest Redis balance hashes, and calls `sync_balances_v2`. [SyncBatchingManagerV3.ts:60](../../../server/src/internal/balances/utils/sync/SyncBatchingManagerV3.ts#L60) [SyncBatchingManagerV3.ts:348](../../../server/src/internal/balances/utils/sync/SyncBatchingManagerV3.ts#L348) [syncItemV5.ts:25](../../../server/src/internal/balances/utils/sync/syncItemV5.ts#L25) [syncItemV4.ts:95](../../../server/src/internal/balances/utils/sync/syncItemV4.ts#L95)

The event manager batches independently, then queues the Postgres event insert and sends the same batch to Tinybird. Its stored event keeps the **requested** value and includes a deduction breakdown containing what actually changed. That is why the concurrent cap test records two value-`5` events even though only one request applies usage. [EventBatchingManager.ts:13](../../../server/src/internal/balances/events/EventBatchingManager.ts#L13) [EventBatchingManager.ts:57](../../../server/src/internal/balances/events/EventBatchingManager.ts#L57) [initEvent.ts:58](../../../server/src/internal/balances/events/initEvent.ts#L58) [usage-window-enforcement.test.ts:547](../../../server/tests/integration/balances/usage-windows/usage-window-enforcement.test.ts#L547)

The integration tests' two-second waits demonstrate eventual convergence; they are not a persistence SLA. The coalescing stress test separately proves that a burst of `30` accepted Tracks converges Postgres to the exact final Redis balance and that the latest usage-window snapshot wins. [sync-coalescing.test.ts:111](../../../server/tests/integration/balances/sync/sync-coalescing.test.ts#L111) [sync-coalescing.test.ts:178](../../../server/tests/integration/balances/sync/sync-coalescing.test.ts#L178)

## What a worker ACK proves

SQS does not delete a Track message when a worker merely reads it. The worker first runs `runQueuedTrack`; only a fulfilled handler returns the receipt for batch deletion. A transient Redis or database failure is rethrown, so the receipt is not deleted and SQS can redeliver it. [initWorkers.ts:321](../../../server/src/queue/initWorkers.ts#L321) [initWorkers.ts:567](../../../server/src/queue/initWorkers.ts#L567) [processMessage.ts:69](../../../server/src/queue/processMessage.ts#L69)

For an ordinary successful delivery, deletion therefore occurs **after the Redis mutation but before the eventual Postgres and event projections**. There are two terminal no-mutation cases: a duplicate replay is treated as already applied, and a non-transient application error is logged and swallowed rather than retried. So message deletion means “the Track handler reached a terminal outcome,” not unconditionally “this delivery changed a balance.” [runQueuedTrack.ts:45](../../../server/src/internal/balances/track/runQueuedTrack.ts#L45) [processMessage.ts:483](../../../server/src/queue/processMessage.ts#L483)

## Current behavior to carry into design review

| Observable result | What it proves today |
| --- | --- |
| synchronous `200` | the serving mutation completed and the returned balance is post-mutation |
| async or fallback `202` | the command was accepted by SQS; balance is deliberately unresolved |
| successful Track worker deletion | the mutation completed, or the delivery was a terminal duplicate/application error |
| Postgres balance updated | the eventual balance projection has caught up |
| analytics event stored | the requested event has reached that projection; its deductions describe applied usage |

Two implementation edges must stay visible during design:

- the public schema text still says async Track returns `204`, while the handler and integration test return a versioned body with `202`; [trackParams.ts:53](../../../shared/api/balances/track/trackParams.ts#L53) [handleTrack.ts:30](../../../server/src/internal/balances/handlers/handleTrack.ts#L30)
- specific Redis-path conditions such as `skip_cache`, missing cached subject state, and paid allocated balances fall back to a synchronous Postgres deduction, while transient Redis failure queues the Track for later replay. [redisDeductionError.ts:15](../../../server/src/internal/balances/utils/types/redisDeductionError.ts#L15) [handleRedisTrackErrorV3.ts:60](../../../server/src/internal/balances/track/v3/handleRedisTrackErrorV3.ts#L60) [runTrackWithRollout.ts:46](../../../server/src/internal/balances/track/runTrackWithRollout.ts#L46)

This page records the current contract. It does not yet decide the Kafka outcome record, the worker receipt format, or where a future synchronous caller waits.
