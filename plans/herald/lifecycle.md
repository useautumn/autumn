---
author: john + claude
feature: herald-lifecycle
date: 2026-09-28 (re-derived; v1 was 2026-09-22)
status: draft, not yet approved
---

# Herald's life: rolling deploys and blue/green swaps that nobody notices

Herald is a follower: it holds no balances and answers no requests. A deploy can
only make it **lag**, **repeat** a batch, or **skip** a record. The bar for this
plan is smoothness on both deploy paths, judged by four numbers:

```
pause    one group pause per membership change,
         bounded by the slice in flight
repeat   at most one slice per partition per change,
         and the sinks absorb it
skip     never
stop     inside the ECS stop timeout, with an honest exit code
```

## Do deploys need coordination? No. The consumer group is the coordination.

Every herald job is one Kafka consumer group (`<deployment>-herald-<job>`,
`createStreamConsumer.ts:35`). Kafka gives each partition to exactly one member
per generation. A rolling deploy and a blue/green swap are both just members
joining and leaving that group. Nothing outside Kafka has to hand anything over.

What the group cannot do is stop a member from *writing* after its lease ended,
or make a redelivered batch harmless. Those two are herald's job, and today it
does neither:

```
                  today                     after this plan
membership        whole batch runs on; a    slices; a heartbeat between
change            batch > 60s keeps writing slices ends the batch the
                  after the group moved on  moment the group moves
redelivery        Tinybird gets the batch   PG is the ledger; Tinybird
                  again; limit_reached      gets only unsent rows;
                  resent; top-up re-queued  every webhook has a key
quiet partition   first record during any   fromBeginning + seeded
                  rebalance is skipped      place
stop              disconnect, always exit 0 drain one slice, honest code
```

## What kafkajs actually does on a rebalance (2.2.4, eager only)

Verified in `node_modules/.bun/kafkajs@2.2.4/.../src/consumer/`:

- **A member learns of a rebalance only from a failed heartbeat**, and heartbeats
  go out only from `runner.heartbeat()`: after each batch, on an empty fetch, or
  when handler code calls `heartbeat()` (`runner.js:458,371`). Rate-limited to
  one per 3s. There is no background heartbeat.
- **`isStale()` / `isRunning()` never flip on a rebalance.** `isStale` is true
  only after `consumer.seek()`; `isRunning` false only after `stop()`
  (`runner.js:314-315`). v1's fence was built on these. It would never fire.
- **A member rejoins only after every in-flight batch on every fetcher returns**
  (`fetchManager.js:73-93`, `runner.js:113-128`). The broker waits up to
  `rebalanceTimeout` (60s) for it. A handler longer than that is the zombie: the
  group moves on, the new owner re-reads the partition, the old handler is still
  writing to Tinybird.
- **A handler longer than `sessionTimeout` (30s) with no heartbeat gets the
  member evicted**, with the same effect.
- **Offsets commit after every batch and on the rebalance heartbeat** (autoCommit
  default, `runner.js:457,212`). Only resolved offsets are sent. `stop()` and
  `disconnect()` wait for in-flight batches and commit nothing extra.
- **A never-committed partition is asked for LATEST on every generation**
  (`offsetManager/index.js:293-347`), and a partition with no records is never
  committed. With `fromBeginning: false`, a record that lands on such a
  partition between the old generation's last fetch and the new one's
  ListOffsets is skipped. On every rebalance, not only a restart.
- **`recoverFromFetch` rejoins without draining** on leader-epoch errors
  (`consumerGroup.js:553-576`, a broker rolling restart on MSK). Batches still
  in flight then resolve into the new generation's manager and get committed for
  partitions this member no longer owns (`offsetManager/index.js:106-110`).

## What each sink does with a repeat today

| job | key | enforced by | holds for | a redelivery |
|---|---|---|---|---|
| usage-events → Postgres | `events.id` = `topic:partition:offset` | PK + `ON CONFLICT DO NOTHING` (`usageEvents.ts:72-76`) | forever | skipped |
| usage-events → Tinybird | none | in-process `WeakMap` per batch array (`sendUnsentToTinybird.ts:6`) | one process, one array | **written again, into every rollup** |
| balance-webhooks usage alerts | deterministic Svix `idempotencyKey` (`usageAlertToWebhook.ts:61-95`) | Svix | Svix's retention (unverified) | collapsed |
| balance-webhooks `limit_reached` | **none** (`checkLimitReached.ts:50-57`) | | | **sent to the customer again** |
| auto-topups | `auto_topup:pending:…` SET NX EX 30 (`autoTopUpSuppression.ts:10-30`) | misc cache | 30s, cleared when the job ends | re-enqueued; the job re-reads the balance under lock and no-ops when it is no longer below threshold (`setupAutoTopupContext.ts:92-97`) |
| cache-push | not built | | | |
| catalog invalidations | version bump | own group per process | | harmless |

`landRecords` also re-runs records inside one process: a non-store error splits
the batch and re-handles both halves (`landRecords.ts:95-100`), so the first
half's Tinybird rows are sent twice even with no deploy at all.

## Design

### The slot, and what it means for the group

```
        S3 admin/blue-green-herald-active-slot.json
           { flightcontrolBlueArn, ... }   polled 2s, retainOnError
                        │
        ┌───────────────┴────────────────┐
   ECS service blue                ECS service green
   ARN == record → ACTIVE          ARN != record → IDLE
   jobs are IN the group           jobs are OUT of the group
                                   heartbeat every 20s; ok when
                                   topic, events DB, misc cache answer
```

- One group per job, shared by both slots. Flightcontrol gives both fleets the
  same env, so `<deployment>-herald-<job>` is naturally shared. The worker needs
  a group per fleet because its ownership is a handoff protocol; herald's
  ownership *is* the group, so a second group would only add a skip hazard
  (an idle fleet cannot hold the active fleet's place).
- **Idle means out of the group, not paused.** A paused member still owns its
  partitions. `followSlot` joins on active and leaves on idle; it never pauses.
- A swap is two ordinary membership changes: green joins, blue leaves. Both
  may be members for one poll interval. That is safe once the fence below lands.
- A rolling deploy of the **idle** slot touches no group at all. A rolling
  deploy of the **active** slot is N leaves and N joins; joins that arrive during
  one rebalance share a generation, so it costs roughly N+2 pauses.
- `retainOnError` on the slot store, like the worker: an S3 blip must not flip
  membership, because every flip is a group pause.
- No ECS identity (local, tests) → active. An ECS task whose ARN cannot resolve
  refuses to start, like the worker: a placeless task in a shared group would
  join and stay forever.

### Slices and the fence: a member never writes past its lease

`consumeBatch`, the whole safety argument:

```ts
const generation = state.generation;      // bumped on GROUP_JOIN
for (const slice of slicesOf({ records, size: RECORDS_PER_SLICE })) {
  if (state.generation !== generation || stopping) return;
  await landRecords({ ctx, job, records: slice });
  if (state.generation !== generation) return;  // leave unresolved
  resolveOffset(slice.at(-1).position.offset);
  await commitOffsetsIfNecessary();       // autoCommit: false
  await heartbeat();                      // throws → batch ends here
}
```

- **`heartbeat()` between slices is the rebalance signal.** It throws
  `REBALANCE_IN_PROGRESS`, the runner commits the slices already resolved, the
  batch ends, kafkajs drains and rejoins. The slice in flight is the only repeat.
- **A local generation, bumped on `GROUP_JOIN`, is the second signal.** It is
  what catches the `recoverFromFetch` path, where a rejoin happens under a batch
  that is still running: the batch sees the bump and resolves nothing, so no
  offset is committed for a partition it no longer owns. This is the same
  mechanism as `packages/kafka`'s `partitionGenerations`, driven by the group
  event instead of ownership code.
- **`autoCommit: false`, explicit commit per slice.** Removes the implicit
  commits that ride on the rebalance heartbeat and the recoverFromFetch rejoin,
  so a commit is only ever made by a slice that checked its generation first.
- **Slice budget:** a slice must land well inside `sessionTimeout` (30s) and far
  inside `rebalanceTimeout` (60s). Tinybird's client timeout plus the Postgres
  insert bounds it; `landRecords`' store-failure backoff already heartbeats
  every wait (`landRecords.ts:70`). Draft: 500 records, one Tinybird request.
- **The split path** (`landRecords.ts:95-100`) stays, but a re-handled half no
  longer reaches Tinybird twice once the ledger below exists.
- **Stop = one slice.** `stop()` sets `stopping`, waits for the slice in flight,
  leaves the group. Kafkajs' own `stop()` already waits for in-flight batches;
  slicing is what makes that wait short.

### Never skip

- `fromBeginning: true`. A partition with no committed offset reads from its
  start, so a record can never fall between two generations' LATEST lookups.
  This is what `packages/kafka` does for the worker.
- A job with **no place at all** (a brand-new job, first deploy) would replay the
  retained log. So `startHerald` seeds it once: if the group has no committed
  offset on any partition, commit LATEST for every partition before subscribing.
  A group with a place on some partitions and none on others (a partition added
  later) is left alone; earliest is right for a new partition.

### Sinks absorb the residual repeat

The fence turns "every in-flight batch repeats on every change" into "at most
one slice per partition per change, plus any crash". That residual is real, so
each sink has to be idempotent over the whole redelivery window:

- **usage-events: Postgres is the ledger, Tinybird gets only what is unsent.**
  Order flips to Postgres first. `insertUsageEvents` already returns which ids
  were new; a nullable `sent_to_tinybird_at` on `events` records what Tinybird
  confirmed. Per slice: insert (dedup by PK) → select this slice's rows with the
  column null → send those → set the column. A redelivered slice inserts
  nothing new, finds nothing unsent, sends nothing. The only remaining repeat
  is a crash in the milliseconds between Tinybird's confirmation and the mark,
  and it repeats one slice. That is the bound OpenMeter lives with
  (`how-others-stop-duplicates.md`). "Never lose one" holds: a crash before the
  send leaves the rows unsent, and the redelivery sends them.
- **balance-webhooks: every webhook carries a deterministic key.**
  `limit_reached` gets one built the way usage alerts build theirs, from the
  record's position and the feature. Confirm Svix's idempotency retention is
  longer than the longest replay herald can do.
- **auto-topups: accepted as is.** The pending key is noise control; the job's
  own below-threshold re-check under lock is the guarantee. A second enqueue
  costs one SQS message and one read, never a second charge.
- **cache-push:** when built, it reads the subject's state from the worker and
  overwrites, so a repeat is a no-op by construction. Keep it that way.

### Stop, crash, health

- `stopHerald` is the only exit: stop following the slot (leaves the group if
  active, one slice at most) → close stores → flush the logger → exit with a
  code that says what happened. A backstop forces exit at `STOP_BUDGET_MS`.
- Consumer `CRASH` with `restart: false` → `stopHerald({ reason:
  "consumer_crashed" })` → exit 1, so ECS replaces the task instead of leaving a
  member that consumes nothing. Same for `unhandledRejection`.
- A failed start stops what it started (today a half-started herald holds
  partitions for 30s).
- `GET /health` and a 10s `herald.health` log: slot state, generation per job,
  lag per partition, seconds since the last rebalance and how long it took. The
  last two are how "smooth" gets measured on staging.

### Budgets

```
slice (Tinybird + insert + mark)  ≪ sessionTimeout 30s  beat per slice
slowest in-flight slice + join    = the group pause
STOP_BUDGET 20s (backstop 25s)    < ECS stopTimeout ≥ 30s (worker: 90s)
slot poll 2s + leave              < heartbeat max age 90s
```

Hard kill (no SIGTERM): partitions move after `sessionTimeout`, 30s of lag on
that task's partitions. Lowering session to 15s is possible once slices exist
(a heartbeat then goes out at least every few seconds) and is a follow-up.

## Structure

```
apps/herald/src
  main.ts                     guards, build, signals, start
  lifecycle/             NEW  the process
    startHerald.ts            identity → seed places → follow the slot;
                              a failed start stops what began
    stopHerald.ts             once: stop following → stores → exit
    exitHerald.ts             code, flush, backstop
    processSignals.ts         SIGTERM/SIGINT/unhandledRejection → stop
    types/stopReason.ts
  slot/                  NEW  which slot am I
    followSlot.ts             active → jobs.start(); idle → stop + beat
    heraldReadinessChecks.ts  topic metadata, events DB, misc cache
  stream/
    createStreamConsumer.ts   subscribe(fromBeginning), autoCommit:false
    consumeBatch.ts      NEW  slices · generation · commit · heartbeat
    seedGroupPlaces.ts   NEW  a placeless group starts at LATEST
    streamConsumerEvents NEW  GROUP_JOIN → generation++ · CRASH → stop
  consumers/usageEvents/      Postgres first; Tinybird reads the ledger

packages/blue-green/src  NEW  lifted from the worker's src/blueGreen
  identity/resolveTaskIdentity.ts   retries; no ARN on ECS → refuse
  slot/activeSlotEdgeConfig.ts      key per service, retainOnError
  slot/createSlotGate.ts            isActive · describe · subscribe
  heartbeat/createSlotHeartbeat.ts  20s while idle, per-task key
```

The worker and the server keep their own copies for now; the worker is under
active work by Tanvir, so it moves to the package on his schedule, not in this
plan.

## Units

| # | unit | ends with this passing |
|---|---|---|
| 1 | **Herald exits honestly.** `lifecycle/`: stop order, exit codes, logger flush, backstop, failed start cleanup, CRASH → exit 1, `dev:restart` locally. | unit: each stop reason → code; hung stop → forced; CRASH → 1 |
| 2 | **Herald on `packages/kafka`'s consumer.** `TopicRecordHandler.applyRecords({ messages, heartbeat })` + `sliceSize` in the package; `consumeBatch` slices, resolves the slice's last offset, heartbeats. Herald's `createStreamConsumer` becomes a thin binding: `readResumeOffset` (seed a placeless group at LATEST), `applyRecords` → `landRecords`. | unit: heartbeat throws mid-batch → later slices never handled, earlier ones committed; generation bump → nothing resolved. Integration on the Kafka compose: two heralds under a producer, SIGTERM one, SIGKILL the other: every record in Postgres exactly once, longest pause logged |
| 3 | **Never skip.** `fromBeginning: true` + `seedGroupPlaces`. | integration: a record produced to a quiet partition during a restart is delivered; a brand-new job starts at the newest record |
| 4 | **Sinks absorb a repeat.** `events.sent_to_tinybird_at`; usage-events Postgres-first with the unsent select; `limit_reached` idempotency key. | unit: the same slice twice → one Tinybird send; a crash between insert and send → the redelivery sends. Integration: redeliver a batch by resetting the group offset → Tinybird row count unchanged, webhook count unchanged |
| 5 | **Herald follows its slot.** See `blue-green.md` (units 5a, 5b). | unit: gate flips active/idle/active → join, leave, join; heartbeat only while idle. Local: two heralds with fake ARNs and a file-backed record, flip, no gap and no repeat in `events` |
| 6 | **Ship, blue/green.** Infra repo: FC service pair, `herald` in `BLUE_GREEN_SERVICE_NAMES`, ECS match, slot key, heartbeat key, S3 record seeded, `stopTimeout ≥ 30s`. Runbook. | staging: deploy to idle, swap, count `events` and Tinybird rows across the flip; roll the active slot, read the pause from the health log |

Units 1–4 make a plain rolling deploy on one FC service smooth and correct on
their own; 5–6 add the swap. Nothing in 1–4 is throwaway if 5 is delayed.

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | Shared group across slots, or a group per fleet like the worker | Shared. Herald's ownership is the group; a second group would have to mirror the first's offsets to avoid a skip. |
| 2 | Where the Tinybird ledger lives | The `events` table, one nullable column. Redis fails open here, and an outage would silently reopen the duplicate window. |
| 3 | Keep herald's own batch consumer or move onto `packages/kafka`'s | Move. `createTopicConsumer` already runs kafkajs's documented loop (check → apply → resolve → heartbeat, explicit commit, `fromBeginning`, generation fencing) per record for the worker. Extend its handler with an optional `applyRecords` that takes a slice, so herald's Tinybird batching is the same loop at slice size N. One consumer, no parallel copy. |
| 4 | Slice size | 500 records. Replace with a prod batch-size number once herald runs. |
| 5 | Session timeout | Leave 30s in this plan; revisit to 15s after slices exist. |
| 6 | Blue/green package now, or a copy in `apps/herald` | Package, lifted from the worker's newer copy; two apps is the moment. Worker and server migrate later. |
| 7 | Herald task count per slot | 2, given 8 partitions consumed concurrently per task and 64 partitions in prod. Confirm against prod lag once it runs. |

## Open

- Svix idempotency-key retention. If it is shorter than a plausible replay, the
  webhook job needs a ledger too (the same column pattern on a small table).
- The same `commandId` at two offsets (`overview.md` question 3) is still two
  events. That is the worker's dedup plan, not this one.
- A failed webhook send is dropped, not retried. A loss path, out of scope here.
