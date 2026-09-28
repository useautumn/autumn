---
author: john + claude
feature: customer-cache
date: 2026-09-28
status: research-in-progress
---

# How herald runs a job

Herald is one Bun process (`apps/herald`, `bun herald`, same Docker image as the server;
`docker/Dockerfile:9`, `server/package.json:24`) that reads the metering topic once per job.
"A new job is a folder beside these and one line here" (`consumers/heraldConsumers.ts:14-33`).

```
                    ${deployment}-events (64 partitions)
                              │
        ┌─────────────────────┼──────────────────────┬──────────────────┐
  group -usage-events   group -balance-webhooks  group -auto-topups  group -cache-push
  → Tinybird + PG       → record.effects → Svix   → effects → SQS     → logs "skipped"
```

Each job is a `StreamConsumer { name, handle({ records }) }` wrapped by `createStreamConsumer`
(`stream/createStreamConsumer.ts`): group `${deployment}-herald-${name}`, `fromBeginning:false`
(a new job starts at the newest record), 8 partitions concurrently, offsets resolved to
`batch.lastOffset()` only after `handle` returns. Kafka lives there; a job sees only records.

## One batch through `usage-events`

```
┌ Kafka batch, partition 3, offsets 1040–1042 ────────────────────────────┐
└──────────────────────────────┬──────────────────────────────────────────┘
┌ parseBatch → StreamRecord[]                    createStreamConsumer.ts:42-76 ┐
│ { position:{topic,partition,offset}, record: MutationRecord }             │
│ unreadable record → logged herald_record_skipped, dropped                  │
└──────────────────────────────┬──────────────────────────────────────────┘
┌ landRecords                                    landRecords/landRecords.ts   ┐
│ store failure (isStoreFailure) → retry in place, 200ms ×4 → 5s, heartbeat  │
│ any other error → bisect the batch, skip the one bad record loudly         │
└──────────────────────────────┬──────────────────────────────────────────┘
┌ job.handle → recordToUsageEvent → EventInsert{ id:"…-events:3:1042", … } ┐
│ Tinybird first (cannot dedupe), then PG insert ON CONFLICT DO NOTHING    │
└──────────────────────────────┬──────────────────────────────────────────┘
┌ resolveOffset(1042) → autocommit ───────────────────────────────────────┐
```

The rules a job inherits: at-least-once (a crash after Tinybird resends one batch), every record
must be safe to see twice, one bad record never holds its partition, a store outage holds the
partition rather than dropping anything.

## The cache-push job already exists, empty

`consumers/cachePush/cachePushConsumer.ts:22-49`: dedupes the batch's subject keys with
`meteringIdentityToSubjectKey` (customer key, `:entityId` suffixed for an entity), logs
`herald_cache_push_skipped`, pushes nothing. Its docstring is the plan: "read each subject's state
from its worker, join it with the catalog, publish." It is wired into `createHeraldConsumers` and
takes `catalogCache` as input.

## What herald can reach today

| dependency | there? | note |
|---|---|---|
| main Postgres | yes, pool 2 (`setup/getPostgres.ts:5`), `HERALD_DATABASE_URL` | lags the log (see the record page) |
| catalog LRU + invalidation consumer | yes (`setup/getCatalogCache.ts`, `catalog/createCatalogInvalidationConsumer.ts`) | the effects plan said to delete these; they stayed because cache-push needs them |
| misc Redis, edge configs | yes (`getMiscCache.ts`, `createHeraldEdgeConfigs.ts`) | one edge config polled: misc Redis |
| Svix, SQS, Tinybird | yes | |
| **balance worker HTTP client** | **no** | `apps/herald/package.json` has no `@autumn/balance-worker-client` |
| org row / secrets | no | herald reads no org config; only `command.org` on the record |

## Reading a subject from its worker

The server does this today for `customers.get` on the worker path
(`server/src/internal/balanceWorker/subject/readBalanceWorkerSubject.ts:32-62`):

```
command = { type:"readSubjectState", identity, org, occurredAt, requestId }
reply   = client.readSubjectState({ command })  →  { state: SubjectState, catalog: Catalog }
```

The client routes over the ownership log: partition from the identity, owner endpoint from the
tailed ownership topic, HTTP `/v1/read-subject-state`, up to four attempts with a route refresh
each, one deadline (`routing/sendToOwner.ts:17-60`). Building one needs a Kafka client plus
`createKafkaBalanceWorkerClient({ config: { ownershipTopic, commandTopic, partitionCount, timeoutMs, … } })`
(`kafka/createKafkaBalanceWorkerClient.ts:14-85`), the same thing `getBalanceWorkerClient()` does
in the server (`external/balanceWorker/getBalanceWorkerClient.ts:34`).

The reply is the subject "as the next command would see it" (`readSubjectStateCommand.ts:5`):
resets advanced to now, memory at or past the record just read. `client.check({ command })`
returns the same `state` + `catalog` plus a `CheckResult` for one feature (`contracts/check.ts`).
