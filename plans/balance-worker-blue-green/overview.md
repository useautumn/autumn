---
author: tanvir + capy
feature: balance-worker-blue-green
date: 2026-09-26
status: approved for implementation
---

# Balance worker blue-green: the handoff, triggered by a slot record

Follows `plans/balance-worker-handoff/overview.md`. That plan made a partition change hands with
zero customer-visible failures when Kafka's consumer group moves it (rolling deploys, restarts).
This plan runs the same protocol across two whole fleets on an operator's signal, so the worker
can deploy the way the API server, the SQS workers and cron already do: green comes up beside
blue, one action moves the traffic, blue is kept for rollback and shut down later.

## How workers and cron do it today (the mechanism we copy)

```
each task    polls  s3://<admin bucket>/admin/blue-green-active-slot.json  every 2s
             gate:  active  ⇔  record.flightcontrolBlueArn === my ECS service ARN
                    fail-open when there is no ECS identity or no record
             writes a readiness heartbeat every 20s (probes, identity, poll activity)
dashboard    preflight: target has running tasks · no ECS rollout in flight ·
             green heartbeat exists, < 90s old, names the target service, checks ok
             then S3 write ‖ FC swap  (parallel: the gate is a boolean the pollers read)
```

`server/src/queue/blueGreen/*`, `infra/src/app/api/ecs/bg/swap-bg/route.ts`.

## Why a boolean gate is not enough for the balance worker

1. Ownership is per-partition state on the ownership topic, not a poll loop to pause. Someone has
   to claim each partition, after the current owner has drained it.
2. Both fleets in one consumer group would rebalance the moment green joins, before any swap.
   Different `BALANCE_WORKER_DEPLOYMENT` names would give green different topics and a different
   transactional-id prefix, so its fence would not cut blue off.

## The design

```
green boots     group = <deployment>-green-workers    topics, transactional ids: <deployment> only
                its roster deals it ~11 partitions; it prepares each (read-only) and tails the log
                heartbeat: prepared N/M, lag per partition, probes, identity
record flips    dashboard writes admin/blue-green-balance-workers-active-slot.json → green's ARN
green           awaitReadyAnnouncement resolves per partition → announces ready
blue            sees ready → withdraws route → draining → drains → claimed{green}   (shipped)
green           sees claimed → fences → catches up → admits                          (shipped)
dashboard       waits until every partition has a claimed naming a green endpoint, then FC swap
blue            owns nothing; SIGTERM / FC auto-shutdown is a no-op handoff
rollback        write the record back; green is now the predecessor, blue the successor
```

The record is the trigger, not a gate, so the dashboard writes it, waits for the handoffs, and
only then calls Flightcontrol. Nothing in the protocol reads group membership.

### Invariants carried over

- The successor never fences before the predecessor has drained.
- A partition kept by the same worker is not bounced.
- Fallbacks degrade to release-then-claim, never wedge: no `ready` in 5s → release; no `claimed`
  in 3s of silence → self-claim; a live drain re-arms to the 30s cap.

### Fail-open, same as the server gate

No ECS identity (local, tests) or no record → the fleet is active: `awaitReadyAnnouncement`
resolves at once and the worker behaves exactly as before this plan. A record naming a service
ARN that is not ours → hold. A record naming ours → go.

## Work

### 1. `packages/env`: the slot

- `BALANCE_WORKER_SLOT` = `blue` | `green`, required in production, defaults to `blue` elsewhere.
- `balanceWorkerDeploymentToKafkaNames` gains `slot`; only `consumerGroup` changes:
  `${deployment}-${slot}-workers`. Topics, transactional-id prefix (`createWorkerProducerConfig`),
  checkpoint prefix, catalog invalidation group prefix: deployment only.
- Tests: names for both slots; production refuses an unset slot.

### 2. `apps/balance-worker`: slot store, gate, hook, heartbeat

- `edgeConfig/`: a `balanceWorkerActiveSlot` store beside `dbControl`, key
  `admin/blue-green-balance-workers-active-slot.json`, schema = the server's `ActiveSlotConfig`
  (`flightcontrolBlueArn`, `activeTaskDefinitionArn`, `activeImageSha`, `updatedAt`, …), poll 2s.
- `init/`: resolve the ECS task identity the way the server does (`awsTaskIdentity`); pass an
  `awaitReadyAnnouncement` that resolves when `isActiveSlot()` (same rules as
  `server/src/queue/blueGreen/blueGreenGate.ts`), re-checking on every store change, aborting on
  the partition's signal.
- Heartbeat writer, 20s, key `admin/blue-green-heartbeats/balance-workers.json` (one object per
  fleet, last writer wins, like workers/cron): identity, slot, `partitions: { prepared, ready,
  admitted, total }`, per-partition `{ status, lagRecords }`, probes `{ kafka, postgres }`, `ok`.
- A worker that is the active slot (or fail-open) must behave byte-for-byte as today: the tests in
  `tests/unit/partitions/partitionHandoff.test.ts` keep passing with no hook set.
- Unit tests: gate rules (no identity / no record / ours / not ours), hook resolves on flip and
  aborts on revoke, heartbeat shape.

### 3. Local proof: two-slot benchmark

Extend `apps/balance-worker/tests/benchmarks/ownership-handoff/` (do not fork it): a `--slots`
mode spawns two fleets with `BALANCE_WORKER_SLOT` and a file-backed slot store (an injected
`EdgeConfigS3Client` whose `send` reads a JSON file; the worker polls it like S3). Scenario:

| step | action | assert |
|---|---|---|
| 1 | blue ×2 up, hammer 20 req/s per partition | all 200 |
| 2 | green ×2 up, record still blue | ownership unchanged, green heartbeat prepared 4/4, all 200 |
| 3 | write record → green | 0 non-200, every 200 applied once, longest detour < 300ms, every partition `claimed{green}` |
| 4 | SIGTERM blue | nothing on the ownership topic, all 200 |
| 5 | write record → blue (blue gone) | no-op, green keeps serving |
| 6 | SIGKILL one green | the 30s window as today, survivor self-claims, no loss / double-apply |

Report the same median/max tables as the join/leave benchmark. Also add the step-3 scenario to
`tests/integration/kafka/ownership-admission.test.ts` under a smaller hammer for CI.

### 4. `infra` (after 3 is green, separate PR)

- `BlueGreenServiceName` gains `balance-workers`; staging + prod config entries with the FC service
  id, ECS match, active-slot key and heartbeat key.
- `swap-bg` for this service is sequential: preflights (running tasks, no rollout in flight,
  heartbeat fresh + `prepared == total` + lag under threshold) → write record → poll the ownership
  topic or heartbeats until every partition is admitted by the target fleet (bounded, ~60s) →
  FC swap → report. Partial states surfaced as today.
- Rollback = the same route with the other target.

### 5. Staging

Create the green FC service (blue-green strategy, auto-shutdown 1h to start), deploy, run the
hammer against staging, flip from the dashboard, count C2S 503s in Axiom. Expect zero.

## Decided

- S3 record as the trigger; the ordering that matters (drain before fence) is enforced on the
  ownership topic by the protocol regardless of how "go" arrives.
- Green prepares only what its roster deals it. Fleet sizes may differ; a green re-deal before the
  swap is invisible to customers (nothing announced yet).
- Blue is kept after the swap as the rollback target; Flightcontrol's green auto-shutdown timer
  bounds that. The swap preflight refuses a target fleet with 0 running tasks.
- Dead consumer-group ids from throwaway tails and readers expire on their own (no commits, 7-day
  broker retention); the API already does this per instance.
- Out of scope, separate follow-ups: cooperative rebalancing, the 30s session timeout, the 0.2%
  join tail, subject pre-warming during prepare, a live partition-count change (this plan is its
  prerequisite, not its solution).

## Open

- Heartbeat granularity: one object per fleet (last writer wins, like workers/cron) vs one per
  task. Start with per fleet; the dashboard needs `prepared == total`, which per-task heartbeats
  would have to be summed.
- Whether the dashboard's "all partitions admitted" wait reads the ownership topic directly or the
  fleet heartbeat. Heartbeat is simpler (S3 read); the topic is exact. Start with the heartbeat and
  a 20s cadence; revisit if the wait is too coarse.
