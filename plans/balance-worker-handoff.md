# Balance worker: handoff

2026-09-24 · `john/one-record` · worktree `austin` · written for whoever picks this stack up next

## What it is, in one screen

The balance worker replaces the Redis FullSubject cache and Lua deduction path for check, track,
locks, resets and (increasingly) billing-plan writes. One Bun process per ECS task, 512 Kafka
partitions co-owned across the fleet, each customer hashed to one partition. The owner keeps the
customer's rows in memory, decides every command there, appends the mutation to Kafka, and a
committer flushes it to Postgres. Postgres is the truth; Kafka is the receipt; memory is a cache.

```
server (hono)                    balance worker (owner of partition p)
  runBalanceWorkerTrack ──HTTP──► receiveTrack ─► hydrate rows (PG, once) ─► decide
  runBalanceWorkerCheck            │                                          │
  applyBillingPlan / evict / flush │                                     append mutation
  queue.{track,reset,evict} ─Kafka─┘                                  ───► commands topic
                                            metering topic ◄──── committer flushes ──► Postgres
ownership topic (compacted): partition → endpoint    server tails it to route
herald (apps/herald): tails the metering topic → Tinybird events, later auto top-ups
```

Backend is Postgres (`state/stateBackend.ts`, `STATE_BACKEND = "postgres"`). The SQLite +
S3-checkpoint backend still exists and is what a shadow deployment runs; do not delete it.

## Where things live

| piece | path | note |
|---|---|---|
| worker process | `apps/balance-worker/src/` | `init/` builds it, `partitions/` owns assignment, `runtime/` one per partition, `processor/` decide + writer, `committer/` PG flush, `consume/` queued commands, `http/` handlers |
| pure engine | `packages/balance-engine/` | commands (track, check, reset, lock, finalize, plan apply), deduction, `SubjectState` rows model; no I/O |
| server ↔ worker client | `packages/balance-worker-client/` | routing over the ownership log, HTTP send with 1s budget, Kafka queue door, catalog invalidations |
| Kafka plumbing | `packages/kafka/` | topics + codecs, transactional producer, consumer, `coPartitionedAssigner` |
| Postgres repos | `packages/postgres/` | `getSubjectRows` (hydration), `commitFlush`, catalog rows, pooled balances |
| server entry points | `server/src/external/balanceWorker/`, `server/src/internal/balances/balanceWorker/`, `server/src/internal/balanceWorker/` | client singleton + rollout flag; per-command adapters; billing-plan / catalog / subject converters |
| env + fixed constants | `packages/env/src/balanceWorker/` | `balanceWorkerConstants.ts` is the tuning file (pool 32, 512 partitions, 1s budget, 32 MiB subject map per partition) |
| herald | `apps/herald/` | plan in `plans/herald/` |
| plans | `plans/balance-worker-*` | one folder per feature: `overview.md` (design) + `units.md` (ordered units, each ending on a test) |

## Branch state

- `john/one-record` is 782 commits past `origin/og/balance-kafka-msk-auth` (the Conductor target)
  and 164 past `origin/dev`. No PR exists for it. PR #3363 (`og/balance-kafka-msk-auth` →
  `og/balance-source-observations`, MSK IAM auth) is the only open PR in the chain.
- dev was last merged 2026-09-24 (`37d354e059`, audited through `0b66f78a4c`). The next merge
  needs the audit in `plans/balance-worker-dev-merges.md`; `cf6bfe9a2d` (PR #3631) is not merged yet.
- The branch moved a lot of server logic (API renderers to `shared/api`, credit rates and usage
  limits to `shared/utils`, deduction to `packages/balance-engine`, `executeAutumnBillingPlan`
  into four steps). Plain `git merge dev` silently drops dev's changes to the old locations.
- 72 server unit failures (finalizeLock, replay, shadow, handle-track, workerStateToFullSubject)
  predate the last merge and are not merge damage.

Uncommitted in this worktree (2026-09-24, John reviews as one diff, never commit unasked):

| change | files |
|---|---|
| paid allocated v1 track falls back to the legacy Postgres lane | `packages/balance-engine/src/commands/track/isPaidAllocatedV1Deduction.ts` (+test), `server/src/internal/balanceWorker/paidAllocatedFallback/` (+tests), `plans/balance-worker-allocated-v1-track.md` |
| old `postgresFallback` tests deleted (`AD`) | `server/tests/unit/balanceWorker/postgresFallback/*` |
| auto top-up plan, draft | `plans/balance-worker-auto-topup/` |
| queued evict / flush follow-through | `consume/settleQueuedFailure.ts`, `commandConsumer/createCommandRecordHandler.ts`, `writer/actions/evict.ts`, client `queue/*`, `kafka/topics/command/*` |
| reset cron: worker lane, Stripe anchor helper removed | `server/src/cron.ts`, `cron/cronInit.ts`, `cron/resetCron/getStripeSubscriptionAnchor.ts` (D) |
| subject rows SQL | `packages/postgres/src/subjects/repos/getSubjectRows/subjectRowsSql.ts` (+test) |

## Plan status

| plan | status | what is left |
|---|---|---|
| customer-state, postgres-commit, balance-engine-commands | landed | design docs; the code is the branch |
| dedup (`balance-worker-dedup/`) | ready-for-review; units 1–6 landed | 7 (crash never decides twice), 8 (async/batch track through the queue) |
| locks (`balance-worker-locks/`) | ready-for-review | units 1–6 in; verify against the server lock suites |
| partition-resilience | landed through unit 8 | none; decisions recorded in its `units.md` |
| pooled-balances, pool-writes | ready-for-review; pool-writes units 1–5 done | pool-writes unit 6, the integration sweep on the rollout |
| resets (`balance-worker-resets/`) | approved; units 1–2 done | 3–9: subject brought current per command, explicit reset, rollovers, anchors, pooled promotion, sweep lane, `getFull` asks the worker |
| get-or-create | units 1–8 code done | known gaps: pooled rows land in PG while the worker holds pools; rows the worker doesn't hold take stale → resend → PG fallback |
| entity-create | units 1–6 done; unit 7 (delete) parked | |
| eviction (`balance-worker-eviction/`) | units 1, 3, 5 done 2026-09-24 | 2 (plan evicts only when it bypassed), 4 (core routes go `"routed"`), 6 (routing per org + bucket handoff), 7 (one invalidation verb, after merge) |
| apply-plan | draft | units 1–4; unit 4 moves rebalances (one-off, auto top-up) onto the worker |
| resilience (`balance-worker-resilience/`) | draft | 503 for every temporary failure, queued sync track 202, check fails open, creates shed and recover |
| auto-topup | draft, new today | herald decides top-ups off the log; worker check triggers |
| allocated-v1-track | draft, new today | fallback lane for paid allocated v1 rows |
| routing, concurrent-writers | stubs, not started | routing = per (org, env) edge config + forward/back handoff; writers = every non-worker writer of worker-held rows |
| get-parity | doc | customers.get / entities.get parity on the worker |

## Known gaps to keep in mind

- Worker track never calls `triggerAutoTopUp`; threshold settlement and auto top-ups do not fire
  after a worker deduction (auto-topup plan).
- Paid allocated v1 rows invoice on the legacy path only (allocated-v1 plan, in the diff above).
- Bypass writes: ~55 legacy sites write worker-held rows directly and rely on the chokepoint evict;
  the inventory is in `plans/balance-worker-eviction/overview.md`.
- A `"log"`-durability caller keeps its 200 even if the store later refuses the record (decided
  2026-09-22, partition-resilience). Acceptable only while stale guards stay rare.
- Every rebalance wipes every partition's memory on every worker (see deploys, below).
- Routing is one env flag (`BALANCE_WORKER_ROLLOUT_ENABLED`, on unless `"false"`, sandbox only
  outside dev), not per org yet.

## Production and deploys

Prod fleet (us-east-1, `fc-balance-workers-rkjjwz-r7350z`, Flightcontrol): 24 tasks, 1 vCPU / 4 GiB,
rolling 200% / 100%, stopTimeout 90s, no container health check, no circuit breaker. A deploy on
2026-09-24 started 24 new tasks in ~30s and stopped the old 24 over ~3 min. Staging
(`tf-balance-worker-staging`, Terraform) sits at 0 tasks. Task-def env carries no `BALANCE_WORKER_*`
overrides; the constants file is the config.

What a deploy does to memory today, and the researched fix (2026-09-24):

```
each GROUP_JOIN / REBALANCING (≈36 per deploy):
  every member ─► detachPartitions([...all entries])   partitionAllocation.ts:98
              ─► every runtime stopped, subject maps gone
  assigner: partitionId % sortedMemberIds              coPartitionedAssigner.ts:25
              ─► partitions reshuffle across members
  next command per customer ─► getSubjectRows            ≤ 24 × 32 = 768 PG clients
```

Recommended order: (1) sticky assignment via the assigner's `userData` (previous holder keeps the
partition; only departed members' partitions move) plus keeping runtimes alive across a revoke,
validated by bookmark equality with `partition_progress`; (2) snapshot handoff of lost partitions'
subject maps through S3 (reuse `s3/` checkpoint plumbing), restored when the offset matches;
(3) queued evicts must land first, since an HTTP evict during the ownerless window is lost.
librdkafka (`@confluentinc/kafka-javascript`, cooperative-sticky + static membership) is the
long-term route; kafkajs is eager-only.

## Running it

```sh
bun dw                                   # worktree stack incl. worker + herald (scripts/dw)
cd apps/balance-worker && bun test:unit  # unit
bun test:kafka                           # tests/integration/kafka   (dev services)
bun test:postgres                        # tests/integration/postgres (dev services)
bun ts                                   # per package; also `cd server && bun ts`
```

Integration tests need the server AND `bun workers`; missing workers means silently missing PG rows.
Server suites: `bun t <folder>`; one file at a time with `./run.sh` only for TDD loops. Never run the
whole suite per change; one pass when the change set settles.

## Working agreements John holds this stack to

- Plans are `overview.md` + `units.md`; one unit at a time, stop for review, explicit approval before
  the next. Every unit ends on a passing test named in the table.
- Leave work uncommitted; John reviews one diff. An open PR is not push authorization.
- `cache_version` is a stale-sync guard, never bumped on runtime cache paths.
- Cache invalidation lives in `refreshCacheConfigs.ts`, never inline in actions.
- Named-param objects, `{ ctx, ...params }`, domain folders with `repos/` + `actions/`, full words
  (`customerProduct`, `perEntityCustomerEntitlements`), comments ≤ 2 lines and only for WHY.
- Biome only on touched files; never repo-wide.
- Check `autumn/shared/utils/` before writing any filter/find/transform over Autumn objects; ask
  before adding a helper.

## First things to do

1. Review and commit the uncommitted diff above (John decides), then merge `cf6bfe9a2d` from dev
   with the audit.
2. Finish eviction units 2 and 4; they unblock the resets units and apply-plan unit 4.
3. Resets units 3–9 (approved).
4. Decide the deploy-memory plan (sticky assignment first) before the next prod rollout under load.
