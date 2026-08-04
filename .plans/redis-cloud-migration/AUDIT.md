# Misc-cache codebase audit (2026-08-04)

Full inventory from three parallel explores of `feat/migrate-redis-cloud` HEAD. Companion to [PLAN.md](./PLAN.md).

## 1. Clients & init

| Client | Built at | URL source | Notes |
|---|---|---|---|
| V1 main (`redis`) | `initUtils/redisClientRegistry.ts:29,120` | `CACHE_URL` (us-west-2) / `CACHE_URL_US_EAST` (us-east-2) via `redisConfig.ts` | Proxy re-resolves per property access (`mainRedisRouting.ts:14`); ~30 importing files |
| Fallback | `redisClientRegistry.ts:37-45` | `CACHE_BACKUP_URL` | aliased to primary if identical; `cacheCert: null` |
| `getPrimaryRedis()` | `redisClientRegistry.ts:125` | pinned `PRIMARY_REGION` us-west-2 | backs ALL distributed locks (rationale `redisUtils.ts:3-4`) |
| `redisV2` | `initRedisV2.ts:22` | `CACHE_V2_DRAGONFLY_URL` via `getReachableDragonflyUrl` | 1s prod timeout (vs 10s V1); constructs even with "" url |
| Org dedicated | `orgRedisPool.ts:32` | encrypted `orgs.redis_config` row | falls back to shared V2 |
| Ramp destination | `cacheV2Ramp/cacheV2RampClient.ts:78` | encrypted S3 edge config | lazy, hot-swappable |

Kill switch: `internal/misc/mainRedisCache/` — S3 `admin/main-redis-cache-config.json`, 10s poll, `activeInstance: "primary" | "fallback"`, read at `redisClientRegistry.ts:97`. Admin: `handleUpsertAdminMainRedisCacheConfig.ts`, `handleGetAdminMainRedisCacheConfig.ts`. **Swap, not dual-write.**

Wrapper seams (all default to main `redis` / `getPrimaryRedis()`, all accept an instance override):
- `utils/cacheUtils/CacheManager.ts` — getJson/setJson/del/invalidate
- `utils/cacheUtils/cacheUtils.ts:78,116,155` — `tryRedisNx`/`tryRedisWrite`/`tryRedisRead` (`redisInstance ?? redis`)
- `external/redis/utils/runRedisOp.ts:79,103` — `runRedisOp`/`tryRedisOp`
- `utils/cacheUtils/queryWithCache.ts` — read-through over CacheManager
- `external/redis/redisUtils.ts` — locks (`acquireLock:72`, `withLock:143`, `clearLock:19`, `refreshLockLease:41`)

Wiring: API `init.ts:41-52` (warmup + monitors before listen); workers `workers.ts:109-131` (dynamic imports; warmup happens in `queue/initWorkers.ts:605`); cron `cron.ts:4`. Health: `honoUtils/handleHealthCheck.ts:14`, `handleReadyCheck.ts:5`.

## 2. Region machinery (unit 5 target)

`initUtils/redisConfig.ts`: `ALL_REGIONS` [us-east-2, us-west-2], `currentRegion` (AWS_REGION || us-west-2), `primaryCacheUrl`, `cacheBackupUrl`, `getConfiguredRegions`, `getCacheUrlForRegion`, `PRIMARY_REGION`, `hasRedisConfig`.

`getConfiguredRegions()` fan-out sites (all pattern `regions.map(getRegionalRedis).filter(ready).del(...)`):
- `redisWarmup.ts:39` (warm 1 conn/region + fallback)
- `internal/dev/apiKeys/cacheApiKeyUtils.ts:60` (`clearSecretKeyCache`)
- `internal/orgs/orgUtils/cacheOrgWithFeatures.ts:78` (× both envs)
- `internal/products/productCacheUtils.ts:96` (4 deterministic key variants)
- `internal/auth/cacheCustomerJwtAuth.ts:100`
- `fullCustomerCacheUtils/deleteCachedFullCustomer.ts:49,74` + `batchDeleteCachedFullCustomers.ts:137` (die in units 1–2)
- tests: `setup-integration-tests.ts:92`, `tests/utils/testInitUtils/setOrgCurrency.ts:28`

`currentRegion` consumers: registry/initRedisV2/orgRedisPool/cacheV2RampClient client labels + telemetry-only tags in `runRedisFinalizeLockV2.ts:65`, `saveLockReceipt.ts:52`, `saveLockReceiptV2.ts:41`, `executeRedisDeductionV2.ts:233`, `SyncBatchingManagerV3.ts:223`, `RefreshEntityAggregateBatchingManager.ts:177`. `hasRedisConfig`: `redisAvailability.ts:6`, `handleHealthCheck.ts:14`, `withMigrationCustomerLock.ts:51`, mocks in 2 unit tests. Duplicate env check: `utils/initUtils.ts:18-23`.

`supportsUpstashShebang`: `createRedisClient.ts:26` (default false) vs `registerRedisCommands.ts:81` (default true — inconsistent); `redisV2Config.ts:24` (true only for upstash instance).

## 3. Legacy fullCustomer cache (units 1–3 target)

**Write-only. Zero readers** — `redis.getCustomer` has 0 call sites; no `getCachedFullCustomer` exists. RedisJSON blob on main redis. Keys (`fullCustomerCacheUtils/fullCustomerCacheConfig.ts:22,38`, `pathIndex/pathIndexConfig.ts:11`): `{org}:env:fullcustomer:1.0.0:cusId`, `...:guard:cusId`, `...:pathidx:cusId`. TTL 3d. `fullCustomerCacheUtils/README.md` already declares the dir deprecated.

Live writers (all Lua `defineCommand` on main `redis`):
| Call site | Command |
|---|---|
| `cusEnts/CusEntitlementService.ts:588` | updateCustomerEntitlements |
| `cusEnts/actions/updateCusEntDbAndCache.ts:60` | updateCustomerEntitlements |
| `actions/resetCustomerEntitlements/executeResetCache.ts:59` | updateCustomerEntitlements |
| `balances/utils/deduction/executeDeductionCache.ts:93` | updateCustomerEntitlements |
| `fullCustomerCacheUtils/updateCachedCustomerData.ts:70` | updateCustomerData |
| `fullCustomerCacheUtils/appendEntityToCache.ts:45` | appendEntityToCustomer |
| `fullCustomerCacheUtils/updateEntityInCache.ts:57` | updateEntityInCustomer |
| `invoices/actions/cache/upsertInvoiceInCache.ts:61` | upsertInvoiceInCustomer |
| `cusEnts/actions/cache/incrementCachedCusEntBalance.ts:37` | adjustCustomerEntitlementBalance |
| `cusProducts/actions/cache/updateCachedCustomerProduct.ts:46` | updateCustomerProduct |
| `fullCustomerCacheUtils/deleteCachedFullCustomer.ts:97` | deleteFullCustomerCache (region fan-out) |
| `fullCustomerCacheUtils/batchDeleteCachedFullCustomers.ts:78-86` | raw SET/UNLINK pipeline per region |

Back-edges from live code (why it's still wired):
1. `deleteCachedFullCustomer.ts:54-61` → `invalidateCachedFullSubject`; **~35 prod call sites import it** (refreshCacheMiddleware, deleteCustomer, insertInvoices, billing sync/rollback/flash, deferred billing, Stripe/RevenueCat webhooks, crons, migrations, rewards, licenses, balances) — KEEP export, gut legacy half (cloud repo dependency).
2. `fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.ts:3` → `batchDeleteCachedFullCustomers` (other caller: `cron/resetCron/clearCusEntsFromCache.ts:2`).
3. `fullSubject/actions/updateCachedEntityData.ts:33-40` → legacy `updateEntityInCache` (fire-and-forget mirror).
Lesser: `handleCreateEntity/autoCreateEntity.ts:12` → `upsertEntityInCache`; `cusUtils/cusUtils.ts:24` + `actions/updateCustomerData.ts:6` + `actions/ensureStripeCustomerFromCustomerData.ts:5` → `updateCachedCustomerData`.

Dead Lua (registered `registerRedisCommands.ts:91-184`, 0 callers): getCustomer, setCustomer, setEntitiesBatch, getEntity, setSubscriptions, setEntityProducts, setInvoices, setCustomerDetails, setGrantedBalance, deleteCustomer, batchDeleteCustomers, batchDeduction, deductFromCustomerEntitlements, setFullCustomerCache, resetCustomerEntitlements. Backing: entire `_luaScripts/` tree + `_luaScriptsV2/{deleteFullCustomerCache/setFullCustomerCache.lua,resetCustomerEntitlements/,deductFromCustomerEntitlements/}`. Also unused: `pathIndex/buildPathIndex.ts` (only `tests/perf/v2CachePerf.test.ts`), `testFullCustomerCacheGuard.ts`. Reference branch: `chore/remove-legacy-lua-scripts` @ `67bda935f` (unmerged, −9,694 lines / 52 files).

Affected tests: `tests/unit/redis/batch-invalidate-full-subjects.test.ts`, `tests/unit/queue/processMessage-update-balance.test.ts:57`, `tests/integration/others/refresh-cache/refresh-cache-routes.test.ts:17`, `tests/utils/cusProductUtils/resetTestUtils.ts:15`, `tests/utils/rolloutTestUtils.ts:59` (`JSON.DEL` on legacy key), `tests/perf/v2CachePerf.test.ts`, `perf/redis-bench/setup.ts`, `tests/_temp/batchDeleteCachedCustomers.test.ts`, ~12 integration tests importing `deleteCachedFullCustomer` as cache-clear helper, `tests/unit/redis-otel/parseRedisKeyContext.test.ts:127`.

## 4. Misc-cache consumers by domain (stay, migrate later)

| Domain | Key | TTL | Files |
|---|---|---|---|
| Secret key verify | `secret_key:<hash>` | 3600s | `internal/dev/apiKeys/cacheApiKeyUtils.ts` (get:15 set:34 clear:51); read `actions/verifyKey.ts:24` ← `secretKeyMiddleware.ts:76`; invalidated by `clearOrgCache.ts:36`, `handleDeleteSecretKey.ts:27`, `oauthApiKeyRepo.ts:104`, `handleRevokeConsent.ts:76` |
| Org + features | `org_with_features:<org>:<env>` | 60s | `cacheOrgWithFeatures.ts` (get:27 set:46 clear:65 readthrough:112); hot read in `createWorkerContext.ts:38`, `createAutumnContext.ts:31`; `clearOrgCache.ts:7` has ~25 call sites |
| Products | `products_full:{<org>}:<env>:1.1.0:<variant>` | 86400s | `productCacheUtils.ts` (invalidate:75); read via `ProductService.ts:320,359` → `queryWithCache`; invalidators: `refreshProductsCacheMiddleware.ts:65`, `detectProductVariant.ts:120`, copyProduct/copyEnv/catalogMappings/copySandbox/config push/nuke/pricingAgent |
| Customer JWT | `cjwt_auth:<internalCusId>` | 3600s | `cacheCustomerJwtAuth.ts` (read:47 write:83 invalidate:93) |
| OAuth replay | `oauth:refresh-replay:<hash>` | 30s | `handleOAuthTokenWithApiKey.ts:127-164` (spin 200×25ms) |
| OAuth state | `oauth_state:<key>` | 600s | `platformBeta/utils/oauthStateUtils.ts` |
| Idempotency (dual w/ Dynamo) | `<org>:<env>:idempotency:<sha>` | 24h | `external/redis/idempotencyKeys/operations/*`; orchestration `internal/misc/idempotency/actions/checkIdempotencyKey.ts:52`, `releaseIdempotencyKey.ts:23`; authority via `isIdempotencyDynamoReadEnabled()` — **KEEP for rollback** |
| Stripe webhook dedup | `stripe:webhook:<org>:<env>:<eventId>` | 5m/24h | `stripeIdempotencyMiddleware.ts`; replay `runStripeWebhookReplay.ts:57` |
| Locks | `lock:attach|deduction|stripe-sync|create-entity|create-entity-request|migration-customer:*`, `reward:*`, `sub:<subId>`, `checkout_lock:*` | 60s–15m | `redisUtils.ts`, `buildBillingLockKey.ts:10`, `rewardLock.ts:12`, `executePostgresDeduction.ts:291`, `withStripeSyncCustomerLock.ts:18`, `batchCreateEntities.ts:132`, `createEntityForCusProduct.ts:134`, `withMigrationCustomerLock.ts:26`, `lockStripeSubscriptionUtils.ts:15`, `checkoutSessionLock.ts:21`, `routeHandler.ts:305` |
| Rate limits | `<configName>:<org>:<env>[...]` + hono prefix; `sso-verify-*`, `agent_rules_generate` | window | `rateLimitRedisStore.ts:5` (SCRIPT LOAD/EVALSHA), `rateLimitFactory.ts:121`, `rateLimitMiddleware.ts`, `routerRateLimiter/index.ts:27`; gated `shouldUseRedis()` |
| Auto top-up | `auto_topup:pending:*` (30s), `auto_topup_failed_webhook:*` | 30s+ | `enqueueAutoTopupWithBurstSuppression.ts:18`, `setupAutoTopupContext.ts:205`, `sendAutoTopupFailedWebhook.ts:40` |
| CacheManager misc | `checkout:<id>` 24h, `expired-cus-products:<subId>` 300s, `saved_views*` ∞, `trmnl:*` ∞, `models_dev_pricing` 3h/72h, `migration_run_cancel:<id>` 1h | — | `checkoutCacheActions.ts`, `setExpiredCustomerProductsCache.ts`, `handleSaveView.ts`, `trmnlAuthMiddleware.ts`, `getModelPricing.ts`, `migrationCancelToken.ts` |
| Lock receipts V1 | `lock.redis_receipt_key` | — | `saveLockReceipt.ts:30-41` — **`JSON.SET` (RedisJSON)**, last JSON user after unit 2 |
| Queue leases | policy `redisKey` (zset) | — | `queueCapacityLease.ts:144` (getPrimaryRedis) |

Inline Lua on this instance (keep): `redisUtils.ts:6,12` owned delete/refresh; `checkoutSessionLock.ts:76`; `withMigrationCustomerLock.ts:13`; `queueCapacityLease.ts:7,30`; hono-rate-limiter SCRIPT LOAD.

NOT on this instance (do not migrate): everything `redisV2`/fullSubject (`internal/customers/cache/fullSubject/`, dirtyState, lockV2, deductionV2, orgRedisPool, cacheV2Ramp, redisV2Cache). `external/connect/clientCache/` is in-process LRU despite the name.

## 5. Rollout / routing infra (phase 3 building blocks)

- `internal/misc/rollouts/`: generic `RolloutConfigSchema` (`Record<string, RolloutEntry>`), S3 `admin/rollout-config.json`, `updateRolloutPercent` auto-manages `previousPercent`/`changedAt`. **Hazard: `computeRolloutSnapshot` reads only `entries[0]`** (`rolloutUtils.ts:60,73`) — a second rollout entry breaks fullSubject stale-eviction (`getCachedFullSubject.ts:158`). Only rollout id in code: `"v2-cache"` (`fullSubjectRolloutUtils.ts:5`). `isFullSubjectRolloutEnabled` hardcoded `true` — KEEP (marker).
- Bucket hash duplicated: `rolloutUtils.ts:6-10` and `customerRedisRoutingInfo.ts:18` are byte-identical `Number(BigInt(Bun.hash(x)) % 100n)`; staleness algo duplicated (`isSnapshotCacheStale` vs `isRedisMigrationCacheStale:44`).
- Best A/B-instance precedent: `internal/misc/cacheV2Ramp/` — schemas (encrypted connectionString + migrationPercent trio), store (refuses conn edit while percent > 0), hot-swappable lazy client, `cacheV2RampUtils.ts` predicate. Resolution order in `resolveRedisV2.ts:78-104`.
- Dual-write fan-out precedent: `customerRedisRouting.ts:104-131` `getRedisTargetsForCustomer`; ctx override via prototype-chain clone `:89-91`.
- requestId: `ctx.id` = `rndr-id` || `X-Amzn-Trace-Id` || `generateId("local_req")` (`baseMiddleware.ts:62-66`); workers `createWorkerContext.ts:87`. No requestId bucketing exists anywhere yet.
- New S3 configs register in `external/aws/s3/adminS3Config.ts` + `getAdminEdgeConfigSources()` for admin UI (`vite/src/views/admin/edge-config/EdgeConfigView.tsx`).

## 6. Test map

Routing/bucketing templates: `tests/unit/redis/main-redis-routing.test.ts` (extend for percent router), `cache-v2-ramp.test.ts`, `customer-redis-routing.test.ts`, `migration-staleness.test.ts`, `tests/unit/edge-config/*`. Misc-cache domains: `secret-key-verification.test.ts`, `refresh-cache-routes.test.ts`, `cache-utils.test.ts`, `check-idempotency-dual-write.test.ts`, `idempotency-ttl-config.test.ts`, `stripe-webhook-idempotency-retry.test.ts`, `dual-checkout-completion-race.test.ts`, `auto-topup-lock-retry-suppression.test.ts`, `rate-limit-factory.test.ts`, `get-model-pricing.test.ts`, `handle-health-check.test.ts`. Rollout snapshot fixtures (update if snapshot shape changes): `with-redis-fail-open-gate-rejection.test.ts:128`, `handle-track-queue-fallback.test.ts:66`, `runCheckWithRollout.test.ts:53`, `vercel-log-context.test.ts:56`, `gate-reject-failopen.test.ts:67`, `full-subject-cache-rollout.test.ts:65`.
