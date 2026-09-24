---
author: john + claude
feature: balance-worker-resilience
date: 2026-09-24
status: draft, not yet approved
---

# Resilience on the balance worker path

Scope: the three legacy safety nets on `check`, `track`, `customers.create` / `get_or_create` and
`entities.create`, and what each becomes when the request takes the worker lane. Eviction is out
of scope (`plans/balance-worker-eviction/`).

Units: `units.md`.

## What the legacy path actually does

The three nets are one question with three answers. The question is "is this failure temporary?"
(`isTransientDbError` or `isTransientRedisError`, plus Redis readiness and the FullSubject gate's
429). The answer depends on the route:

```
                       temporary failure on the Redis lane
                                    │
        ┌───────────────────────────┼───────────────────────────┐
  track / track_tokens            check                 get_or_create · customer get
  withRedisFailOpen          withRedisFailOpen          entity get
  → queueTrack (SQS)         → allowed: true            shed503OnTransientError
  → 202, balance: null       → 202, nothing queued      → 503, Retry-After: 1
  enqueue fails → 5xx        + 3s route timeout → 202   + queueFailedCustomerCreation
                             (send_event deduction         (SQS, consumer OFF by default)
                              is dropped)                entities.create: nothing
```

Two corrections to the premise:

- The 503 shed is not a load gate. It is a per-action classifier of Postgres and Redis errors
  (`53*` includes too-many-connections, which is the closest thing to "Postgres overloaded"). There is
  no in-flight or connection-budget signal. The FullSubject gate is the concurrency limiter and it
  answers 429, which check and track turn into fail-open.
- Customer recovery never gives the caller a 202. The caller gets the 503; the enqueue is silent, and
  `replayFailedCustomerCreation` only runs when the job-queue edge config turns it on.

Both extra triggers also matter: `orgRateLimitDegraded` (the org aggregate cap) queues a track and
fails a check open, and the FullSubject gate's 429 does the same.

## What the worker path does today

| operation | worker call | client-side failure | worker-side failure | replay |
|---|---|---|---|---|
| check | HTTP `check`, 1s | 503 | **500** | no fail-open (legacy 3s timeout skipped) |
| check `send_event` / lock | HTTP `track`, 1s | 503 | **500** | none |
| track (sync) | HTTP `track` per feature, 1s | 503, key released | **500** | none |
| track (async) | Kafka `queue.track`, 3s | 503 | raw kafkajs error → **500** | Kafka redelivers transient only |
| get_or_create | HTTP `read` 1s, then `applyBillingPlan` 5s + one resend | 503 | **500** | **none; the legacy shed and recovery enqueue are skipped** |
| entities.create | HTTP `applyBillingPlan` (Stripe already ran) | 503 | **500** | none |

"Client-side" = `UNAVAILABLE_CLIENT_CODES` in `balanceWorkerErrors.ts` (no owner, deadline, transport,
ownership unavailable): mapped to 503 `balance_worker_unavailable` or `balance_worker_result_unknown`
by outcome. "Worker-side" = everything the worker answered with that isn't a 404/409: `NOT_READY`
(its capacity cap, a partition not admitted, catalog evicted, load overtaken), `INTERNAL` (including
partition recovery), `INVALID_RESPONSE` (a load-balancer 502), `CATALOG_NOT_FOUND`, and any non-deadline
Kafka producer error. All fall through `throw cause` at `balanceWorkerErrors.ts:164` to a 500.

So the worker's one real overload signal, `NOT_READY` from the 4,000-per-partition /
1,000-per-customer pending cap, reaches the customer as a 500 today.

## Target model

The worker path already answers the legacy question structurally: the client's `outcome`
(`unknown` | `not_submitted`) and its code say whether the failure is temporary. So the design is
**one predicate, the same three answers, the same wrappers**:

```
 isTransientBalanceWorkerError({ error })      beside isTransientRedisError
   client:  UNAVAILABLE_CLIENT_CODES
   worker:  NOT_READY · INTERNAL · INVALID_RESPONSE
   log:     non-deadline Kafka producer errors
                                    │
        ┌───────────────────────────┼───────────────────────────┐
  track                           check                  get_or_create · create
  withFailOpen                    withFailOpen           shed503OnTransientError
  → queue.track, SAME command     → allowed: true        (+ the worker predicate)
  → 202, key kept                 → 202                  → 503, Retry-After: 1
  append fails → 503, key         send_event deduction   + queueFailedCustomerCreation
  released                        is queued (unit 2)     replay reruns get_or_create,
                                                         which routes to the worker
```

Why the same command id on the queued track: the worker's dedup window
(`plans/balance-worker-dedup/`, Part A) refuses a second application as `DUPLICATE_COMMAND`, and a
refused queued track is logged and dropped. So an `unknown` outcome can be queued without a double
deduction; the log is the receipt. This is strictly better than the legacy SQS replay, which needed
its own Redis dedup key inside the Lua.

Why no `queue.applyBillingPlan`: a create must answer with the customer body, so a queued create
cannot 202. The legacy answer (503 now, recover silently) is the right one, and its payload
(`params` of get_or_create) replays through the same router, so the recovered create takes the
worker lane for free.

`withRedisFailOpen` becomes `withFailOpen({ isTransient, run, fallback })`; the Redis version is that
plus the readiness probe. One wrapper, two predicates, no worker-specific copy.

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | `INTERNAL` / `INVALID_RESPONSE` → 503? Today they are "defects worth surfacing loudly". | Yes, 503 `result_unknown`; keep the error log and Sentry capture. The caller cannot act on a 500 any better, and a load balancer 502 is not a defect. |
| 2 | Queued fallback resends the same command id. | Requires dedup Part A (units 1–3, done uncommitted) landed first. W = 10 min covers the append-to-consume gap. |
| 3 | Deducting check (`send_event`, lock) on fail-open: queue the deduction or drop it like legacy? | Queue it. Same helper as unit 2; `allowed: true` without the deduction under-bills. |
| 4 | A queued track that names a missing customer is refused and dropped after the 202 (legacy replay auto-created). | Accept for now; parked with get-or-create's "queued tracks that name a missing customer". Log at error. |
| 5 | Recovery consumer is off by default. | Ops call. The unit ships the enqueue; turning the consumer on is the edge config. |
| 6 | `entities.create` recovery. Legacy has none; the worker lane runs Stripe before the Autumn write, so a 503 there leaves Stripe charged. | Unit 1 alone turns the 500 into a 503. A recovery enqueue with `entity_id` / `entity_data` (already in the payload shape) is optional unit 5. |
| 7 | `orgRateLimitDegraded` and the gate 429 on the worker path. | Same answers as legacy: track queues, check fails open. The gate is Postgres-lane only, so only the org cap applies. |
