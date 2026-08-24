---
author: johnyeo
feature: ledger
date: 2026-08-23
status: approved
---

# Ledger — shadow rollout for check and track

`apps/ledger` is the Subject Engine service. Shadow mode = the final request path with the reply dropped.
Phase 1 answers one question — does it hold up under production load. Accuracy is proven by running the
existing `server/tests/integration/balances/` suites with the ledger as primary for the test org, not by
per-request comparison.

## The shape

```
API fork                              apps/ledger (new ECS cmd, same image)
runTrackWithRollout                   shard = hash % 256, one process hosts all
  void ledger.track(cmd)  ──────────▶ POST /commands
  await runTrackV3 (Redis, unchanged)   queue → one writer loop
                                        state: bun:sqlite :memory:, today's columns
                                        first sight → import from Postgres
                                        fold → LedgerEntry → journal append → ack
                                        COMMIT → reply (dropped in shadow)
                                      projector → subject_snapshots (never today's tables)
```

Ledger dependencies: Postgres + Redpanda. Never Redis. The command carries nothing read from Redis.

## Routing

- `packages/ledger-client`: `track()`, `check()`; mode from the `ledger` rollout entry via
  `isRolloutEnabled({ rolloutId: "ledger" })` (`rolloutUtils.ts:27` — exists, no callers; `ctx.rolloutSnapshot`
  only holds `entries[0]`, which is `v2-cache`).
- Mode `shadow`: fire before the Redis path, don't await, bounded in-flight. Mode `primary` (tests): return the reply.
- Three call sites, all wrapper-level, all before any Redis read: `runTrackWithRollout`, `runCheckWithRollout`,
  `runQueuedTrack` (async-track orgs — the load we most want). Check-with-lock arrives as a `check` command with
  `lock` in the body.

```ts
type Command = {
  id: string;            // ctx.id — the serial; replay returns the stored result
  org_id; env; customer_id; entity_id?;
  at: number;            // ctx.timestamp — the only clock the fold may use
  api_version: string;
  kind: "track" | "check";
  body: TrackParams | CheckParams;   // raw; the ledger resolves features itself
};
```

## The shard

One writer loop per shard, one SQLite transaction per **slice**, the append is the only `await`
(design §5). A slice is group-commit by time, not count: everything that arrived during the previous
append, folded until a 1 ms budget, the rest deferred to the next slice. Throughput then tracks load
up to the CPU ceiling (≈ 1 ÷ fold cost); latency ≈ 1.5 cycles, where
`cycle = 6 ms ÷ (1 − arrival × fold)`. Pipelining slices (K appends in flight, `ROLLBACK TO SAVEPOINT k`
re-folds k+1…) is the later step — only when a shard's p99 exceeds budget, roughly above 30 %
utilization. Invariant to keep for it: one slice = one append = one savepoint, replies keyed by slice. Import on first sight: six plain selects by `(org_id, env, customer_id)` —
`customers`, `customer_products`, `products`, `customer_entitlements` (+ `entitlements`, `features`), `rollovers`,
`usage_windows`. The import is behind Redis by the unsynced deductions at that moment and does not converge;
irrelevant for load, and at cutover the import runs after `invalidateCachedFullSubject({ flushBalances })`, which
makes Postgres exact.

### Staleness while attach is not yet a command

Every structural write already stamps `customer_lsns.updated_at` at the invalidation chokepoint
(`markCustomerUpdatedAt`, "the freshness ledger after a structural customer write", DB clock, not gated on Redis).
The shard polls it:

```
every 2 s:  SELECT … FROM customer_lsns WHERE updated_at > :last_seen
            → resident customer → mark stale
next command for a stale customer → re-import → fold
```

Needs an index on `customer_lsns.updated_at`. Covers the ~50 chokepoint call sites (attach, update, cancel,
webhooks, balance create/update/delete, migrations, batch resets). Period resets are the fold's own job
(`next_reset_at ≤ cmd.at`). Deleted with the flag at cutover.

## Journal and projector

Topic `subject-events`, key = customer id, 256 partitions (fixed at creation; 64 caps processes at 64).
Idempotent producer, `acks=all`; transactions + fencing arrive with the lease table.

```ts
LedgerEntry   { shard_id, customer_id, org_id, env, version, command_id, at,
                mutations: MutationLogItem[], after: Record<customerEntitlementId, Balance> }
SubjectLoaded { customer_id, version, rows: msgpack }   // import — once per customer at cutover
```

Projector = a shard that only replays: same schema, same `apply(entry)`, no writer loop; writes
`subject_snapshots (customer, version, offset, rows)` then `subject_engine_offsets` — snapshots before offset,
so a restart can never double-apply. Shard boot: offset O → consume O+1…end → snapshot on first sight → open.

## Units

| # | slice | proves | first test |
|---|---|---|---|
| 1 | `apps/ledger`: writer loop, SQLite state, Postgres import, fold (customer-level, feature_id, cap/allow/reject, refunds, unlimited), memory journal, `POST /commands` | the code shape | unit matrix + one `/track` via initScenario |
| 2 | Redpanda journal (kafkajs spike), projector → `subject_snapshots`, `customer_lsns` poll + index, dev compose | the ack latency, the projection | entry in p17, snapshot row at v1301 |
| 3 | `packages/ledger-client` + three server call sites + rollout flag; integration suites in primary mode | accuracy | `balances/track/basic` green against the ledger |
| 4 | widen the fold: credit systems, rollovers, entities, usage windows, spend limits, `target_balance` | parity | matching suites green |
| 5 | check; locks as commands | the read side, the unwind path | check + lock suites green |
| 6 | Dockerfile cmd, FireLens, FlightControl service, metrics; shadow ramp per org | load | dashboards |
| 7 | ownership: lease table, producer fencing, multi-process | failover | only if one process can't carry it |

Each unit is a stacked branch.
