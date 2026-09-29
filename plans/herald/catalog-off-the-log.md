---
author: john + claude
feature: herald
date: 2026-09-23
status: implemented, integration runs pending
---

# Catalog off the log

Load tests: stamping `after.catalog` on every record cuts worker throughput. Only herald's
webhooks job reads it. Decision: the record keeps `after.state`; herald derives the
catalog keys from that state and reads the rows from its own LRU, the same cache the
worker uses. Catalog rows are per-org, so the cache is hot; Postgres only on a cold miss.

```
worker ─[record + after.state]─▶ kafka ─▶ herald ─▶ catalog LRU ─▶ webhooks
                                                       │ miss
                                                       ▼ postgres
```

Rejected: firing from the server (async/batch/finalize have no reply, ordering lost);
computing webhooks in the worker (couples it, and the cache-push job needs the state
anyway); Redis (a hop per record, one more dependency, and it still needs the same
publish on edit).

Invalidation is publish-once, subscribe-many: the server appends one record to a
`<deployment>-catalog-invalidations` topic when a plan is edited; every worker and
herald instance reads it with a group of its own (the ownership consumer's pattern) and
drops the org's rows from its LRU. The TTL stays as the bound when a record is missed.

```
server ─▶ catalog-invalidations ─▶ worker[0..n]  catalogCache.invalidate({orgId, env})
   (middleware, after 2xx)       ─▶ herald[0..n]  same
```

## Units

| # | unit | test |
|---|---|---|
| 1 | **`@autumn/catalog-lru`.** The worker's `src/catalog` moves to `packages/catalog-lru`, plus `ensureCatalogForState` (keys from a state, load misses, throw on rows nobody has), which the worker's `ensureSubjectCatalog` becomes a call to. The source is a `CatalogRowsSource` (`getCatalogRows` only), so any app with a Postgres client can feed it. | package unit tests (moved), worker unit suite green, `bun ts` on both |
| 2 | **Herald reads the catalog itself.** Herald gets a main-DB client (`HERALD_DATABASE_URL`) and a catalog cache; `recordToBalanceWebhooks({ record, catalog })` and `recordToSubjects` take the catalog as a param. Herald calls `ensureCatalogForState` on `after.state`; a record whose rows no longer exist is logged and skipped, never held. `after.catalog` is ignored. | balance-webhooks unit tests pass a catalog; herald consumer test with a stub source; `track/limit-reached/*`, `track/usage-alerts/*`, `lock/finalize-lock-usage-alert` |
| 3 | **Worker stops stamping the catalog.** `mutationAfterSchema.catalog` becomes optional (old records on the log still carry it); `mutationOf` writes `{ state }` only; `PendingMutation.catalog` goes. | worker unit + kafka integration suites; load test confirms the win |
| 4 | **Catalog invalidation over Kafka.** `@autumn/kafka` gets `topics/catalogInvalidation/`: record `{ type: "invalidated", orgId, env, at }` keyed `orgId:env`, a publisher, and a consumer that joins with a fresh group id, reads from latest, and calls back per record. Topic name derives from the deployment (`balanceWorkerDeploymentToKafkaNames`), one partition, plain retention; added to `setupLocalTopics` and `validateBalanceWorkerTopics`. The client exposes `client.catalog.invalidateOrgCatalog({ orgId, env })` on a lazily connected idempotent producer, like the command log. `refreshProductsCacheMiddleware` calls it beside `invalidateProductsCache`; a failed publish is logged, never a 5xx. Worker and herald subscribe on start and call `catalogCache.invalidate`, which already exists. | kafka integration test: publish → both consumers drop the org's rows; server unit test on the middleware; `catalogV2.update` then a track sees the new allowance without waiting for the TTL |
| 5 | **Gate before the cache.** *Parked.* A record-only pre-check that skips the catalog for records that cannot fire. Its balance-crossing rule is a hard filter over increment math, and a wrong answer is a lost webhook; the cache already makes the catalog read cheap, so the gate is not worth that risk yet. |  |
| 6 | *(later)* Drop `catalog` from the schema once the log has rotated past the last stamped record. | — |

Deploy 2 before 3: an old herald needs the stamp, a new herald ignores it. Create the
invalidation topic in MSK before deploying 4: `validateBalanceWorkerTopics` fails boot
without it.

Open: the middleware matches plan and product routes only. Feature edits change cached
feature rows too; `invalidate` already drops them, so adding the feature routes to the
match list is one line. Also the four handlers that call `invalidateProductsCache`
directly (copy product, copy environment, delete Stripe, catalog mappings) need the
same publish, or a server-side `invalidateOrgCatalog` that does both and all five call.

## Unit 4 case matrix

## Unit 5 case matrix (parked)

Kept for when the gate is picked up again.

| record | gate |
|---|---|
| track, balance 10 → 5, no alerts anywhere | no |
| track, balance 5 → 0 | yes |
| track, entity balance in `entities` map 1 → 0 | yes |
| track, balance 10 → 5, customer has an enabled alert | yes |
| track, balance 10 → 5, customer alert disabled, org has none | no |
| track, balance 10 → 5, product carries a plan alert | yes |
| track, usage window moved | yes |
| finalize that moved a balance to 0 | yes |
| initialize / apply-billing-plan | no |
| record without `after` | no |
