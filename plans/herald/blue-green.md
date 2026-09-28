---
author: john + claude
feature: herald-blue-green
date: 2026-09-28
status: units 5a and 5b implemented 2026-09-28 (uncommitted); unit 6 is the infra repo
---

# Herald blue/green: the same record, gate and heartbeat as the worker; the gate moves group membership

Units 1–3 (`lifecycle.md`) made a membership change cheap and a repeat
harmless. This plan makes a swap nothing but two membership changes, driven
by the S3 record the worker and the SQS workers already flip on.

## How the worker does it, and the one thing herald does differently

```
              worker (shipped, Tanvir)       herald (this plan)
record        admin/blue-green-balance-      admin/blue-green-herald-
              workers-active-slot.json       active-slot.json
identity      ECS metadata → service ARN;    same code
              no ARN on ECS → refuse
gate          ARN == record.blueArn          same code
gate decides  holds `ready` announcements    whether the jobs are IN
              (ownership is a handoff)       the consumer group
group         one per fleet: two fleets in   one per job, shared by both
              one group would rebalance      slots; the group IS the
              before the swap                ownership
heartbeat     per task, 20s, partitions      per task, 20s, jobs
              prepared/ready/admitted        joined/total + lag
swap wait     target admitted == total       target joined == total,
                                             source joined == 0
```

Why not a group per fleet like the worker: an idle herald fleet would have to
hold the active fleet's committed offsets to take over without a skip, which
is a second bookmark to keep in sync. With one shared group, Kafka's own
commit is the handoff; green joins and reads from where blue committed.

## The flip, step by step

```
dashboard writes record → green ARN
        │ ≤ 2s poll, both fleets
        ├─ green tasks: gate → active → startJobs()
        │      each job: seedGroupPlaces (no-op) → join → rebalance
        └─ blue tasks:  gate → idle   → stopJobs()
               each job: finish slice in flight → leave → rebalance
        heartbeats (20s): green joined == total, blue joined == 0
dashboard sees both → Flightcontrol swap → done
rollback = write the record back; the same two steps in reverse
```

Cost: two group pauses per job, each bounded by the slice in flight plus a
join. Repeat: at most one slice per partition per pause, absorbed by unit 3.
Nothing on the log is skipped: `fromBeginning: true` and the committed offset
are the same for every member.

## Design

### `packages/blue-green`: the worker's module, lifted

The worker's `src/blueGreen/` is the newest and most-tested copy of this
mechanism (retry-then-refuse identity, `retainOnError` on the store). It moves
into a package unchanged in behaviour; the worker keeps its files until Tanvir
switches the import, which is a mechanical follow-up and not in this plan.

```
packages/blue-green/src
  blueGreen.ts
  identity/resolveTaskIdentity.ts    retries ~10s, then refuses on ECS
  identity/fleetIdOf.ts              sha256(serviceArn)[0:8]
  slot/activeSlotEdgeConfig.ts       schema + default; key per service
  slot/describeSlotGate.ts           the four answers, fail-open
  slot/createSlotGate.ts             describe · isActive · awaitActive
  heartbeat/createHeartbeatWriter.ts 20s writer; { key, build } injected
  types/{taskIdentity,slotHeartbeat}.ts
```

The heartbeat writer is the one generalisation: the worker's `build()` names
partitions, herald's names jobs, so the writer takes `build` and the key and
owns only the interval, the single-flight write, and the warn on failure.

### Herald follows its slot

```
apps/herald/src
  edgeConfig/createHeraldEdgeConfigs.ts
                           + activeSlot store (2s, retainOnError)
                           + adminBucket for the heartbeat
  slot/
    followSlot.ts          the state machine below
    heraldHeartbeat.ts     build(): jobs joined/total, lag, probes
    heraldReadinessProbes  topic metadata · events DB · misc cache
  setup/createHerald.ts    jobs are created per activation, not once
  stream/createStreamConsumer.ts
                           exposes membership() and lag()
```

```
                   record changes (store.subscribe)
   ┌──────────┐    gate.isActive() → startJobs()    ┌──────────┐
   │   IDLE   │ ─────────────────────────────────▶  │  ACTIVE  │
   │ out of   │ ◀───────────────────────────────── │ in group │
   │ the group│    !gate.isActive() → stopJobs()    └──────────┘
   └──────────┘
   heartbeat writes in both states (declaredActive says which)
   transitions run one at a time; a flip during a flip queues the
   latest wanted state and drops the rest
```

- **Jobs are built per activation.** A stopped consumer is single-use in
  `packages/kafka` (`isStopped`), so `createHerald` holds a factory, not a list:
  active builds fresh `createStreamConsumer`s, idle stops and drops them. The
  catalog-invalidation consumer runs for the process's life in either state,
  so the cache is warm the moment the jobs join.
- **The gate is read once at start and then on every store change.** No timer
  of its own; `subscribe` fires only when the served value changes, and
  `retainOnError` means an S3 blip changes nothing.
- **A task that has never read the record does not join.** On ECS the store
  starts with the default, which names no service and would fail open. Herald
  treats "no successful read yet" as idle until the first healthy poll. Off
  ECS (local, tests) there is no record and the gate is open, as today.
- **Identity refuses to start** without an ARN on ECS, exactly as the worker:
  a placeless task in a shared group would consume forever, ignoring the record.
- **`stopHerald` stops following first**, which stops the jobs (one slice
  each, in parallel) and the heartbeat, then closes stores. Inside the 20s
  budget from unit 1.

### The heartbeat body

Key `admin/blue-green-heartbeats/herald/<fleetId>/<instanceId>.json`, one per
task, every 20s, in both states.

```
serviceName "herald" · fleetId · deployment · instanceId · pid
identity { serviceArn, imageSha }
declaredActive · gate reason · storeHealthy
ok = every check && storeHealthy && identity resolved
checks { kafka, eventsDb, miscCache, tinybird?, svix? }
                                         each { ok, latencyMs, error? }
kafka probe = topic metadata + fetch the job groups' committed offsets:
              the task can reach the group it is about to join
jobs { total, joined,
       byJob: [{ name, state: idle|joining|joined|leaving,
                 partitions, maxLagRecords }] }
startedAt · writtenAt
```

`joined` flips on the consumer's `GROUP_JOIN` and back on stop. Lag comes
from the package's progress tracker per assigned partition.

### What the dashboard needs (infra repo, separate PR)

- `herald` in `BLUE_GREEN_SERVICE_NAMES` with its FC service ids, ECS match,
  slot key and heartbeat prefix. The S3 record seeded to the current service.
- Preflight: target has running tasks; no rollout in flight on either; every
  fresh (< 90s) target heartbeat `ok` and `identity.imageSha` equal to the
  build being promoted; source heartbeats fresh, so its leaving is observable.
- After the write, poll (≤ 60s): every fresh target heartbeat
  `jobs.joined == jobs.total` with lag falling, every fresh source heartbeat
  `jobs.joined == 0`, and no heartbeat gone missing (a crashed task). Then the
  FC swap. On timeout the dashboard writes the record back itself and alerts:
  a herald rollback is two membership changes, so it is always safe to take.
- ECS `stopTimeout ≥ 30s` on both herald services.

## Local proof

- Unit, `slot/`: fake store + fake identity. Flip active → idle → active gives
  start, stop, start in order; a flip during a stop queues one start; an S3
  read error changes nothing; no record yet on ECS means idle; off ECS means
  active; identity without ARN on ECS refuses to start.
- Unit, heartbeat: body shape; `ok` false when any probe fails; `joined` follows
  the jobs' membership.
- Kafka compose (`apps/herald/tests/integration/kafka/slot-flip.test.ts`): two
  heralds told apart by fake ARNs, a file-backed record (an injected
  `EdgeConfigS3Client` whose `send` reads a JSON file, as the worker's benchmark
  does). Producer running. Flip to green: every record lands, repeats within
  one slice per partition, green's jobs joined, blue's left. Flip back: same.
  SIGTERM blue while idle: nothing on the group.

## Units

| # | unit | ends with this passing |
|---|---|---|
| 5a | **`packages/blue-green`.** Lift identity, fleet id, slot config, gate, and a `build`-injected heartbeat writer from the worker's `src/blueGreen/`; move its unit tests. Worker untouched. | package unit tests green; worker still typechecks and passes unit (nothing imports the package yet) |
| 5b | **Herald follows its slot.** Active-slot store + admin bucket in herald's edge configs; `slot/`; jobs per activation; membership and lag on the stream consumer; heartbeat. | slot unit tests; `slot-flip` on the Kafka compose |
| 6 | **Ship.** Infra repo entries and swap route for herald; runbook: deploy to the idle slot, watch its heartbeats go `ok`, flip, watch joined counts, FC swap. | staging: one flip with a producer running, `events` row count unchanged in Tinybird and Postgres across it |

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | Shared group vs group per fleet | Shared (above). |
| 2 | Package now, or a copy in herald | Package, lifted from the worker; the worker's switch is Tanvir's follow-up. Two copies of a gate that decides who consumes is one too many. |
| 3 | Heartbeat in both states or idle only | Both. The swap needs `joined == 0` on the source and `joined == total` on the target; the server's idle-only heartbeat cannot say the second. |
| 4 | Hold a task that never read the record | Yes, on ECS. Stricter than the worker, where an unread record opens the gate. For herald, opening the gate means joining a shared group, so the safe default is out. |
| 5 | `/health` endpoint | Not needed for the swap; the heartbeat is what the dashboard reads. Add later if FC wants a container health check. |
