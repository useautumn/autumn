# Herald's life: start, crash, deploy, swap

2026-09-22 · research + draft units and structure · blue/green from day one · awaiting approval · nothing built

Herald is a follower: it holds no balances and answers no requests. The worst it can do is **lag**,
**skip** a record, or **repeat** a batch. Postgres absorbs a repeat by event id. Tinybird does not, and
its 20 rollups keep the double count forever. Every decision below is judged by one question: how many
Tinybird batches can this repeat, and can it ever skip?

## What the balance worker does that herald does not

| | balance worker | herald today |
|---|---|---|
| crash | consumer dies → `onServiceStopped` → `process.exit(1)`, the platform replaces it | no CRASH listener: can sit alive, consuming nothing |
| stop | partitions drain → HTTP → resources; exit 1 when the stop failed; logger flushed | `disconnect()` with no drain; always `exit(0)`; logs dropped; no backstop if it hangs |
| revoke | generation-fenced; `isRunning` / `isStale` checked before every record | whole batch runs to the end; a revoked batch still writes to Tinybird |
| start | fails fast on missing topics; a failed start cleans up what it opened | serial start, no rollback: a half-started herald holds partitions for 30s |
| health | `GET /health`, 10s health log with per-partition lag | nothing |

`packages/kafka`'s `createTopicConsumer` has the fencing, but per record. Herald works in batches (one
Tinybird request, one multi-row insert), so it keeps its own consumer and borrows the two ideas: check
between slices, save the place per slice.

## How blue/green works here, and what it means for a Kafka consumer

```
                 S3  admin/blue-green-<service>-active-slot.json
                     { flightcontrolBlueArn, updatedAt, ... }
                          ▲ swap writes        │ polled every 2s
                          │                    ▼
 infra dashboard ──▶ ECS service "blue"   ECS service "green"
   swap-bg           serviceArn == blue    serviceArn != blue
                     ACTIVE                IDLE: writes a readiness
                                           heartbeat every 20s
```

- A slot is a whole second ECS service; both run all the time. Identity comes from ECS metadata
  (`serviceArn`), never an env var. No metadata (local, tests) → active. That is the fail-open.
- Today only `workers` (SQS) and `cron` are gated; the idle slot just skips its poll loop. The gate code
  lives in `server/src/queue/blueGreen/` and `server/src/external/aws/ecs/awsTaskIdentity.ts`.
- The swap **refuses** unless the green slot has written a readiness heartbeat in the last 90s with
  `ok: true` (`infra-src .../swap-bg/route.ts`). So an idle herald must write one, or it can never be promoted.
- A Kafka consumer cannot "skip its poll": while it is in the group it owns partitions. **Idle means out of
  the group.** So herald's gate joins and leaves, it does not pause. The server's ownership consumer runs
  ungated on both slots today; herald must not copy that.
- The swap flips both slots within one poll (2s). For that window both may be members: one ordinary
  rebalance. Safe only once a revoked batch stops writing (unit 3), which is why fencing lands first.

## The three cases

**a. A worker recycles.** SIGTERM: leave the group, partitions move in seconds. Hard kill: 30s session
timeout first. At most the slice in flight per partition repeats. **A skip exists today**: `fromBeginning:
false` and kafkajs saves a place only for partitions that had records; a quiet partition whose first
record lands during a restart loses that event.

**b. Rolling deploy of one slot.** Every join and leave pauses the group for seconds; N tasks ≈ 2N pauses
of lag. Fine for a follower. Smooth = leave on SIGTERM, stop writing on revoke, finish inside the stop timeout.

**c. Swap.** Green idle → active: join. Blue active → idle: leave, stay alive, start heartbeating. Swap
back is the same in reverse. Neither slot ever exits because of a swap.

## Units

| # | unit | closes | ends with this passing |
|---|---|---|---|
| 1 | **Herald exits honestly.** Exit code says what happened; logger flushed on every path; a backstop forces exit if stop hangs; a failed start stops what it started; process guards. | a b | unit: stop order, failed stop → 1, hung stop → forced, failed start → cleaned up |
| 2 | **A dead consumer ends the process.** CRASH → stop → `exit(1)`; `restartOnFailure` off; `dev:restart` locally like the balance worker. | a | unit: fake consumer emits CRASH → herald exits 1 |
| 3 | **A revoked batch stops writing.** Batch in slices; `isRunning` / `isStale` before each; place saved and heartbeat after each; stop waits for the slice in flight. | a b c | unit: `isStale` flips mid-batch → later slices never reach Tinybird |
| 4 | **`packages/blue-green`.** Task identity, the active-slot record as an edge config, the gate, the readiness heartbeat writer. Ported from `server/`; server keeps its copy for now. | c | package unit tests with a fake metadata endpoint and a fake S3 |
| 5 | **Herald follows its slot.** Active → jobs join; idle → jobs leave and heartbeat; flips handled in order, never overlapping. Local: no identity → active. | c | unit: fake gate flips active/idle/active → join, leave, join; heartbeat only while idle |
| 6 | **Every partition has a saved place.** On assignment, a partition with none gets one. | a | integration on the Kafka compose: a record produced to a quiet partition during a restart is delivered |
| 7 | **Herald can be seen.** `GET /health`, a 10s `herald.health` log with lag per job and the slot state, topic checked at start. | all | unit: lag maths; start fails on a missing topic |
| 8 | **Ship it, blue/green.** Dockerfile lines for `apps/herald` and `packages/tinybird`; `herald` script in `server/package.json`; `bun ts` filter; CI. Infra repo: FC service, `herald` in `BLUE_GREEN_SERVICE_NAMES`, `ecsServiceMatch`, `activeSlotKey`, S3 record seeded. | b c | deploys to staging; a swap moves consumption between slots with no gap in `events` |

## Structure

Herald today: `setup/` wires, `stream/` owns Kafka, `consumers/` are the jobs. Two nouns join them,
named the way the balance worker names its own: the process's **lifecycle**, and the **slot** it runs in.

```
apps/herald/src
  main.ts                          guards, build, signals, start
  setup/                           get* accessors; createHerald wires and nothing else
  lifecycle/                  NEW  the process
    startHerald.ts                 identity → slot polling → follow the slot; a failed start stops what began
    stopHerald.ts                  stop following (leaves the group if active) → stores → exit; once
    exitHerald.ts                  exit code, flush, the forced-exit backstop
    processSignals.ts              SIGTERM / SIGINT / unhandledRejection → stopHerald
    types/stopReason.ts            "signal" | "consumer_crashed" | "start_failed"
  slot/                       NEW  which slot am I, and what that means for the jobs
    followSlot.ts                  gate says active → jobs.start(); idle → jobs.stop() + heartbeat
    heraldReadinessChecks.ts       what "ready to be promoted" means: topic reachable, events DB answers
  stream/
    createStreamConsumer.ts        orchestrator: subscribe, run, stop
    consumeBatch.ts           NEW  slices; still mine? → handle → save place → heartbeat
    streamConsumerEvents.ts   NEW  CRASH → onCrashed; join / rebalance → one log line each
  consumers/                       unchanged

packages/blue-green/src        NEW  ported from server/, no server import
  blueGreen.ts                     exports
  identity/resolveAwsTaskIdentity.ts   ECS metadata → { serviceArn, imageSha } | null, memoized
  slot/activeSlotEdgeConfig.ts     key per service, schema, default (an @autumn/edge-config config)
  slot/createSlotGate.ts           { isActive(), describe(), subscribe(onChange) } over identity + store
  heartbeat/createReadinessHeartbeat.ts   every 20s while idle: run injected checks, write S3
  types/
```

The one state machine, in `followSlot`:

```
                 gate.isActive()
   ┌──────────┐  true → jobs.start()  ┌──────────┐
   │   IDLE   │ ─────────────────────▶│  ACTIVE  │
   │ heartbeat│ ◀───────────────────── │  in group│
   └──────────┘  false → jobs.stop()  └──────────┘
        ▲ start (identity resolved, gate read once)
```

`stopHerald` is the only exit. Reasons are process reasons; a swap is not one of them, because an idle
herald stays alive:

```ts
export const stopHerald = async ({ ctx, reason }) => {
	ctx.state.stopping ??= finishStop({ ctx, reason });
	return ctx.state.stopping;
};
const finishStop = async ({ ctx, reason }) => {
	const backstop = forceExitAfter({ ms: STOP_BUDGET_MS });
	const failures = await stopInOrder([ctx.slotFollower, ctx.eventsDb]);
	await exitHerald({ ctx, reason, failures, backstop });
};
```

`consumeBatch`, the whole safety argument in one loop:

```ts
for (const slice of slicesOf({ records, size: RECORDS_PER_SLICE })) {
	if (!isStillMine({ payload })) return;
	await ctx.streamConsumer.handle({ records: slice });
	savePlace({ payload, slice });
	await payload.heartbeat();
}
```

## Budgets

```
slice handle (Tinybird 10s + insert)   <  sessionTimeoutMs 30s     heartbeat follows each slice
STOP_BUDGET_MS                         <  ECS stopTimeout          backstop fires before SIGKILL
slot poll 2s + leave                   <  heartbeat max age 90s    swap sees a fresh heartbeat
```

## Open questions

1. Readiness checks for the heartbeat: topic metadata + events DB `select 1`. Add a Tinybird probe, or is a
   failing Tinybird a "ship anyway, it replays" case?
2. Unit 6: save a place on assignment, or flip to `fromBeginning: true` once herald is live?
3. Slice size: 500 records is the draft. A number from prod batch sizes would be better.
4. Does the server switch to `packages/blue-green` in this plan, or later? (Draft: later; the port is a copy.)
