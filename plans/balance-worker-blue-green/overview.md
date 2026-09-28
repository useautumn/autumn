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
green boots     group = <deployment>-workers-<fleetId>    topics, transactional ids: <deployment> only
                fleetId = sha256(its ECS service ARN)[0:8]; blue's differs, so no rebalance
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

### 1. The consumer group: one per fleet, from the ECS service ARN

- `packages/env` keeps every Kafka name deployment-only; `BALANCE_WORKER_GROUP_ID` is the base
  `${deployment}-workers`. No fleet env var: Flightcontrol has one env block per service and both
  of its ECS fleets receive it verbatim, so anything set there is the same on blue and green.
- The worker derives its group at boot, after `resolveTaskIdentity`: `${base}-${fleetId}` with
  `fleetId = sha256(identity.serviceArn)[0:8]` (`blueGreen/fleetIdOf.ts`); no ECS identity (local,
  tests) → the base group, unchanged; an ECS task whose ARN does not resolve refuses to start.
  Topics, transactional-id prefix (`createWorkerProducerConfig`), checkpoint prefix, catalog
  invalidation group prefix: deployment only.
- Tests: the base group off ECS, the suffixed group on it, the two fleets' ids differ.

### 2. `apps/balance-worker`: slot store, gate, hook, heartbeat

- `edgeConfig/`: a `balanceWorkerActiveSlot` store beside `dbControl`, key
  `admin/blue-green-balance-workers-active-slot.json`, schema = the server's `ActiveSlotConfig`
  (`flightcontrolBlueArn`, `activeTaskDefinitionArn`, `activeImageSha`, `updatedAt`, …), poll 2s.
- `init/`: resolve the ECS task identity the way the server does (`awsTaskIdentity`); pass an
  `awaitReadyAnnouncement` that resolves when `isActiveSlot()` (same rules as
  `server/src/queue/blueGreen/blueGreenGate.ts`), re-checking on every store change, aborting on
  the partition's signal.
- Heartbeat writer, 20s, key `admin/blue-green-heartbeats/balance-workers/<fleetId>/<instanceId>.json`
  (one object per task): identity, fleet id, `partitions: { prepared, ready, admitted, total }`,
  per-partition `{ status, lagRecords }`, probes `{ kafka, postgres }`, `ok`. The dashboard sums
  fresh task heartbeats by fleet.
- A worker that is the active slot (or fail-open) must behave byte-for-byte as today: the tests in
  `tests/unit/partitions/partitionHandoff.test.ts` keep passing with no hook set.
- Unit tests: gate rules (no identity / no record / ours / not ours), hook resolves on flip and
  aborts on revoke, heartbeat shape.

### 3. Local proof: two-slot benchmark

Extend `apps/balance-worker/tests/benchmarks/ownership-handoff/` (do not fork it): a `--slots`
mode spawns two fleets told apart only by a fake service ARN (`BENCH_SERVICE_ARN`, which names
their groups) and a file-backed slot store (an injected `EdgeConfigS3Client` whose `send` reads a
JSON file; the worker polls it like S3). The record flips between the two ARNs. Scenario:

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
Runbook: no env var to set in Flightcontrol on either fleet; the worker derives its fleet id from
its ECS service ARN.

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

## Decisions

Recorded while implementing items 1–3 (2026-09-28, PR "feat(balance-worker): blue-green slots drive the partition handoff").

- **The owner reacts to a foreign `ready`, not only to a revoke.** The design above assumed "blue
  sees ready → withdraws" was shipped; it was shipped for a *revoked* entry only
  (`beginPartitionHandoffs` ran from revoke and stop). Two fleets have two rosters, so blue is never
  revoked: in the first benchmark pass green announced, heard 3s of silence, self-claimed and fenced
  blue mid-commit, and green's first flush conflicted with the bookmark blue was still advancing.
  Every admitted entry now listens for another endpoint's `ready` (`watchForSuccessor`) and runs
  the same withdraw → draining → drain → `claimed{successor}` path. Its own roster still deals it
  the partition, so it pauses that partition's commands itself and does not re-prepare it; a later
  re-deal (a blue restart) prepares and holds at the gate because the record names green. Re-armed
  after an A→A cancel, torn down by the entry's abort.
- **A partition handed to another fleet is prepared again.** The first cut stopped the runtime and
  dropped the entry after a foreign handoff, while the owner's roster kept the partition assigned;
  a rollback flip then had nothing to announce. The entry is now re-prepared (read-only follower,
  held at the gate), the state a green task is in before a swap, so flipping the record back runs
  the same handoff in reverse (benchmark steps 3b/3c). Only with a gate: without one it would
  announce at once and take the partition straight back, so a gate-less worker stays stopped.
- **No fleet env var; the group comes from the ECS service ARN.** The first cut introduced
  `BALANCE_WORKER_SLOT` (blue | green), required in production. That cannot work on Flightcontrol:
  a service has one env block and both of its ECS fleets receive it verbatim, so blue and green
  would boot with the same slot, share a group, and green would rebalance-steal partitions on boot.
  The workers/cron gate never had this problem because it keys on the ECS *service ARN*, the one
  thing that differs between the fleets. The worker now does the same: after `resolveTaskIdentity`
  it consumes in `${deployment}-workers-${fleetId}`, `fleetId = sha256(serviceArn)[0:8]`
  (`blueGreen/fleetIdOf.ts`, group in `init/workerConfig.ts`). Off ECS it is the plain
  `${deployment}-workers`, so local runs and tests are unchanged. Runbook: nothing to set in
  Flightcontrol; the fleet id is in the boot log and the heartbeat.
- **The slot store retains its last record through a read error** (`retainOnError`), and the
  heartbeat's `ok` includes the store's health: each of those defaults would otherwise have opened
  green's gate without a flip.
- **An ECS task that cannot resolve its service refuses to start.** `resolveTaskIdentity` retries
  the metadata endpoint (~10s) and then throws, so the process exits non-zero and ECS replaces the
  task. It used to fail open at error level; once the ARN also names the consumer group that is no
  longer safe: a task with no ARN would join the unsuffixed base group as a one-task fleet with an
  open gate, take every partition and fence its healthy peers, and two such tasks would share the
  base group, the very bug the fleet id fixes. Fail-open stays only for runs with no metadata URI
  (local, tests), where there is no fleet.
- **The first rollout renames the existing fleet's group, once.** The running fleet is in
  `${deployment}-workers`; the first task with this code joins `${deployment}-workers-<fleetId>`, a
  second, unrevoked group beside it, and the partitions move by release-then-claim with the fence:
  the new task prepares and announces `ready`; an owner that watches for a successor hands off
  (withdraw → drain → `claimed{new}`), an older one stays silent and the new task self-claims after
  the silence window and fences it. One bounded detour per partition, one time. Every later deploy
  of either fleet is a rolling deploy inside its own group, and a slot flip is the handoff. The
  earlier "blue keeps the legacy name" decision avoided this rename at the price of the env var
  above, which Flightcontrol cannot set per fleet; the one-time rename is the smaller price.
- **Heartbeat per task, every task writes.** `admin/blue-green-heartbeats/balance-workers/<fleetId>/<instanceId>.json`
  rather than one object per fleet: with two tasks per fleet a last-writer-wins key shows one task's
  `prepared/total`, so `prepared == total` cannot be read and the post-flip "admitted by green" count
  cannot either. The body carries `fleetId` and `identity.serviceArn`; the dashboard groups by the
  ARN (the record names an ARN, not a colour). `declaredActive` carries the gate's answer; the
  dashboard lists the prefix, keeps objects with `writtenAt` under 90s (a killed task's last object
  stays behind) and sums per fleet.
- **Steps 5 → 6.** Step 5 (record → blue with blue gone) is asserted a no-op for 5s and the record is
  then restored to green before the SIGKILL. A survivor whose record names the gone fleet prepares
  the dead task's partitions and holds at the gate for good, the same hazard the dashboard's
  "target has running tasks" preflight refuses.
- **`/v1/track-batch` now holds mid-handoff.** The batch route lacked the `awaitHandoff` hold of
  `/v1/track`, so every handoff on this branch (rolling and slot alike) answered 409 before
  `claimed{successor}` was durable and the client's one refresh still found the old owner:
  ROUTE_STILL_STALE on ~8% of the tracks in the window. Fixed in the same PR; the rolling JOIN and
  LEAVE rows are back to zero failures.
- **Where the gate lives.** `apps/balance-worker/src/blueGreen/` (`resolveTaskIdentity`, `isActiveSlot`,
  `createSlotGate`, `createSlotHeartbeat`), not `packages/env`: the identity is a fetch of the ECS
  task metadata, not an env read. The slot store is `edgeConfig/activeSlotEdgeConfig.ts` beside
  `dbControl`, on its own 2s poll (the dashboard writes the record without the registry's timestamp).
  `createEdgeConfigStore` gained `subscribe()`, notified only when the served value changes, so the
  hook never runs a timer of its own.
- **Detour is ~0.7–0.77s on this rig, not < 300ms.** A track that meets blue between withdraw and
  `claimed{green}` is held for blue's drain (350–600ms here: the accepted tracks' Postgres apply on
  Neon, ~200ms RTT from the benchmark machine) then answered 409, refreshed and resent (~250ms to
  green's first 200). The latency target depends on the Postgres round trip, as the handoff plan's
  "Drain includes the store apply" decision already implied; the drain itself is not on the
  customer's clock for tracks that were not in flight at the withdraw.
- **One `ROUTE_STILL_STALE` in 1,024 flip-window tracks (3 passes).** A batch held at blue was
  answered 409 4ms after `claimed{green}` landed; the client's refresh read the log before the
  routing consumer had the record and the resend met blue again. This is the client-side tail the
  Decided section lists as out of scope ("the 0.2% join tail"); the batcher's two route attempts
  versus `sendToOwner`'s four is where a fix would go.
- **The dead-owner fixture is deaf.** `partitionHandoff.test.ts`'s "late draining record" case stood
  a live, unrevoked worker in for a dead owner; a live owner now answers a `ready`, so the fixture
  says explicitly that it never hears one.

## Production rollout log

- 2026-09-28: balance-workers and herald converted to blue/green in Flightcontrol; FC created the `-2` green services. The first S3 record must name the original (live) service as blue: Initialize ran before FC tagged `-2` and picked it, so balance-workers was re-marked by hand.
