# Redis Cloud → Dragonfly migration (misc cache)

Branch: `feat/migrate-redis-cloud`. Companion doc: [AUDIT.md](./AUDIT.md) — full codebase inventory (clients, consumers, key prefixes, rollout infra). Cloud-repo breakage audit: [CLOUD-AUDIT.md](./CLOUD-AUDIT.md).

## Goal

1. **Cleanup**: delete the legacy fullCustomer cache (write-only, zero readers), dead V1 Lua scripts, and the multi-region machinery (infra is single-region now).
2. **Reorganize**: consolidate misc-cache infra under `server/src/external/redis/miscCache/`.
3. **Migrate**: rolling, percentage-of-requests migration of the misc cache (secret keys, org, products, JWT, locks, rate limits, …) from Redis Cloud to Dragonfly, designed to be reusable for any future misc-cache instance move.

## Locked decisions (John, 2026-08-04)

- **Keep `deleteCachedFullCustomer` exported with its current signature** — the cloud superset repo (`~/autumn/cloud`) imports it. Gut the legacy misc-cache half of its body only.
- **Keep the Redis leg of idempotency dual-write** — DynamoDB will be authoritative by merge time, but Redis code stays for rollback. John handles the flip.
- **Keep `isFullSubjectRolloutEnabled`** (hardcoded `true`) and its call sites — intentional marker for future rollouts.
- **Migration target env var: `CACHE_MISC_DRAGONFLY_URL`** (a Dragonfly instance for the misc cache).
- **Remove the `supportsUpstashShebang` machinery** entirely as part of the region collapse.
- **Coordination keys (locks, rate limiters, idempotency, replay guards, webhook dedup) are never percent-routed by requestId** — they cut over atomically via the `activeInstance` switch. Only read-through caches ride the percentage ramp. (Two requests for the same customer hashing to different instances would break mutual exclusion.)
- **The new migration mechanism does NOT live in the `rollouts` edge config** — `computeRolloutSnapshot` only reads `entries[0]` (`rolloutUtils.ts:60`); a second entry would silently break fullSubject stale-eviction. Model on `cacheV2Ramp` (own S3 key, encrypted destination conn string).

## Phase 1 — Cleanup (DONE 2026-08-04, uncommitted on feat/migrate-redis-cloud)

Cloud-repo compat contract (which exports MUST survive and why): see [CLOUD-AUDIT.md](./CLOUD-AUDIT.md).

| # | Unit | Status | Scope |
|---|------|--------|-------|
| 1 | Gut legacy half of `deleteCachedFullCustomer` / `batchDeleteCachedFullCustomers` | DONE | Keep exports + full signatures (**incl. `skipGuard`** — 2 cloud callers pass it). `deleteCachedFullCustomer` body → `invalidateCachedFullSubject` only. `batchDeleteCachedFullCustomers` → deprecated no-op stub returning 0; `batchInvalidateCachedFullSubjects` drops the call (check its return-value consumers). Remove the `updateCachedEntityData.ts:31-40` V1 mirror. |
| 2 | Delete legacy fullCustomer writers | DONE | Remove legacy cache legs from live functions (`updateCusEntDbAndCache.ts:60`, `CusEntitlementService.ts:588`, `executeResetCache.ts:59`, `executeDeductionCache.ts:93`, `upsertInvoiceInCache.ts:61`, `updateCachedCustomerProduct.ts:46`, `incrementCachedCusEntBalance.ts:37`). Delete zero-cloud-ref helpers (`appendEntityToCache`, `updateEntityInCache`, `upsertEntityInCache`+`autoCreateEntity.ts:12` call, `testFullCustomerCacheGuard`, `pathIndex/`). **Keep `updateCachedCustomerData` as deprecated no-op stub** (cloud migration-server imports it); server callers (`cusUtils.ts:24`, `actions/updateCustomerData.ts:6`, `ensureStripeCustomerFromCustomerData.ts:5`) drop the call. Last RedisJSON user after this: `saveLockReceipt.ts:41`. |
| 3 | Delete dead V1 Lua scripts | DONE (incl. `claimLockReceipt` — zero callers; kept `getTotalBalance.lua` + `mutationItemUtils.lua`, still used by V2 deduct script; moved `lua.d.ts` into `_luaScriptsV2/`) | Entire `server/src/_luaScripts/` tree + registered V1 commands (`registerRedisCommands.ts`) + `_luaScriptsV2/{setFullCustomerCache,resetCustomerEntitlements,deductFromCustomerEntitlements}` + `redisTypes.ts` entries. Zero cloud refs — safe. Reference (do NOT blind cherry-pick): unmerged branch `chore/remove-legacy-lua-scripts` @ `67bda935f`. |
| 4 | ~~Remove Redis leg of idempotency~~ | SKIPPED | Stays for rollback. John flips Dynamo authority. |
| 5 | Collapse region machinery + remove upstash shebang | DONE (new `getMainRedis()`; `getPrimaryRedis` aliases it; `getRegionalRedis(_region?)` kept as deprecated shim; `currentRegion` kept as telemetry label; `warmupRegionalRedis` reimplemented main+fallback+V2) | Delete from `redisConfig.ts`: `ALL_REGIONS`, `getConfiguredRegions`, `getCacheUrlForRegion`, `PRIMARY_REGION`, `CACHE_URL_US_EAST`. Collapse `redisClientRegistry.ts` regional map to primary+fallback. Update fan-out sites to single-client DEL: `cacheApiKeyUtils.ts:60`, `cacheOrgWithFeatures.ts:78`, `productCacheUtils.ts:96`, `cacheCustomerJwtAuth.ts:100`, test harness. **Keep exports (cloud contract): `warmupRegionalRedis` (reimplemented single-client, still chains `warmupRedisV2`), `waitForRedisReady`, `getPrimaryRedis`, `getRegionalRedis` (deprecated shim → main client).** Dedupe env check in `utils/initUtils.ts:18`. Remove `supportsUpstashShebang` machinery (`createRedisClient.ts:26`, `registerRedisCommands.ts:81`, `redisV2Config.ts:24`) — keep `RedisV2InstanceName.upstash`. Keep `CACHE_BACKUP_URL` fallback + `mainRedisCache` activeInstance switch. |
| 6 | ~~Retire dead v2-cache branches~~ | SKIPPED | `isFullSubjectRolloutEnabled` stays as a marker. |
| 5b | Rename primary→misc + delete `redisV2Config.ts` | DONE | Canonical names: `miscRedis` (export), `getMiscRedis()`, `miscRedisUrl`, `miscRedisBackupUrl`, `hasMiscRedisConfig` (renamed everywhere, no alias), `miscRedisRouting.ts` (`createMiscRedisRouter`/`selectMiscRedisClient`). Deprecated aliases kept for cloud: `redis`, `getPrimaryRedis`, `getRegionalRedis`. `currentRegion` now falls back to `DEFAULT_AWS_REGION` (`awsRegionUtils.ts`, us-east-2) — prod unaffected (ECS sets AWS_REGION); local telemetry label changes us-west-2→us-east-2. `redisV2Config.ts` deleted: `getRedisV2ConnectionConfig` had 0 callers; `REDIS_V2_COMMAND_TIMEOUT_MS` moved to `createRedisClient.ts`. Edge-config domain (`internal/misc/mainRedisCache`, S3 key `admin/main-redis-cache-config.json`, `MainRedisInstanceName`) intentionally NOT renamed yet — S3 key rename is config-breaking; fold into phase 3 unit 9. |

## Phase 2 — Reorganize

| # | Unit | Scope |
|---|------|-------|
| 7 | Create `server/src/external/redis/miscCache/` | Move infra only: client registry, `mainRedisRouting`, wrapper seams (`CacheManager`, `cacheUtils.tryRedis*`, `runRedisOp`), `redisUtils` locks, `mainRedisCache` edge-config store. Export explicit `getMiscRedis()`. Domain caches (org/secret-key/products/JWT) keep their homes in `internal/` and consume it. |

## Phase 3 — Reusable rolling-migration mechanism

| # | Unit | Scope |
|---|------|-------|
| 8 | Shared bucket utils | Consolidate duplicate `Number(BigInt(Bun.hash(x)) % 100n)` (`rolloutUtils.ts:6`, `customerRedisRoutingInfo.ts:18`) + duplicate staleness checks (`isSnapshotCacheStale` / `isRedisMigrationCacheStale`) into generic `getBucket` / `isBucketRoutingStale`. Add `getRequestBucket({ requestId })` (`ctx.id` from `baseMiddleware.ts:62` — rndr-id / X-Amzn-Trace-Id / `generateId("local_req")`). Test templates: `tests/unit/redis/migration-staleness.test.ts`, `cache-v2-ramp.test.ts`. |
| 9 | Misc-redis migration edge config | Extend `mainRedisCacheSchemas` with `cacheV2Ramp`-shaped destination: encrypted `connectionString`, `url`, `migrationPercent`/`previousMigrationPercent`/`migrationChangedAt`. Copy patterns from `cacheV2RampClient.ts` (lazy hot-swappable destination client, disconnect on change) and `cacheV2RampStore.ts` (refuse conn edits while percent > 0). Destination reads `CACHE_MISC_DRAGONFLY_URL` as the default/bootstrap URL. Admin routes + `EdgeConfigView.tsx` section; register S3 key in `adminS3Config.ts`. |
| 10 | Per-request routing + dual invalidation | `ctx.miscRedis` threaded like `ctx.redisV2` (worker equivalents: `createWorkerContext.ts`, `createAutumnContext.ts`). Bucket by requestId decides old vs new instance for cache wrappers. `getMiscRedisTargets()` (analog of `getRedisTargetsForCustomer`, `customerRedisRouting.ts:104`) fans every DEL/invalidate out to both instances while ramp active. |
| 11 | Coordination keys pinned | Locks (`redisUtils`, billing/checkout/entity/migration/stripe-sub locks), rate limiters, stripe webhook idempotency, OAuth replay guard, auto-topup suppression, queue capacity leases call `getMiscRedis()` directly — resolves from `activeInstance` only, ignores the bucket. |

## Phase 4 — Cutover (ops)

- Verify Dragonfly compat: `SCRIPT LOAD`/`EVALSHA` (hono-rate-limiter store), inline `eval` lock scripts, `JSON.SET` (`saveLockReceipt.ts:41` — last RedisJSON user after unit 2), `{orgId}` hash tags (`products_full:{orgId}`).
- Ramp 1 → 10 → 50 → 100 over days (TTLs are short: org 60s, keys 1h, products 24h — new instance warms fast).
- Flip `activeInstance` to the Dragonfly URL — coordination keys cut over here; lock TTLs ≤ 300s bound the drain window; brief idempotency/rate-limit amnesia is acceptable.
- Decommission Redis Cloud; remove `CACHE_URL` region naming; remove ramp state.
- Dashboards: `create-redis-dashboard` skill has the canonical Axiom template.

### Post-rename follow-ups (DONE 2026-08-04)

- `redisV2Availability.ts` decoupled from miscRedis: the `redisV2 === miscRedis` aliasing branch was dead (separate client objects, never identical) — always uses its own monitor now.
- `runRedisOp` / `tryRedisOp`: `redisInstance` is now REQUIRED; the implicit miscRedis default is gone. 8 misc-cache call sites (org cache, secret-key cache, migration-customer lock) pass `miscRedis` explicitly.
- Deleted the `updateCachedCustomerData` and `batchDeleteCachedFullCustomers` shims — **cloud WILL break** at: `apps/migration-server/src/middleware/customerMiddleware.ts:3` (+test), `scripts/src/firecrawl/fill-missing-customer-emails.ts`, `scripts-v2/runs/firecrawl/sync-stripe-identity/utils/update-queue.ts`, `scripts/src/mintlify/import/workflow.ts:88,121`. Fix in cloud repo (accepted by John 2026-08-04). Only `deleteCachedFullCustomer` remains as a shim.

## Cleanup units bundled INTO the routing work (phase 3, John 2026-08-04)

Do these alongside unit 10 (per-request routing) — they touch the same call sites:

- **Delete the `miscRedis` Proxy + singleton.** Replace `import { miscRedis }` with `getMiscRedis()` called INSIDE function bodies (never module top-level — that re-freezes the choice at import time and silently breaks the fallback switch), and `ctx.miscRedis` on request-scoped paths. ~30 importing files. Cloud wrinkle: `apps/test-runner/worker/initOrgUtils.ts` imports the deprecated `redis` alias — fix that one cloud file, then delete the alias + `createMiscRedisRouter`/`miscRedisRouting.ts` entirely.
- **Fix the `runRedisOp`/`tryRedisOp` double-instance API.** Today `operation` closes over the client AND `redisInstance` is passed separately (only used for ready-check/error classification) — nothing enforces they match, which is dangerous once two instances are live during the ramp. New shape: `operation: (redis: Redis) => Promise<T>` — the helper passes `redisInstance` into the callback, so the client is named exactly once. Sweep all call sites (misc + fullSubject V2 paths).

## Open items

- Whether to also remove the `upstash`/`redis` alternate V2 instances (`CACHE_V2_UPSTASH_URL`, `getAlternateRedisV2Instance`, `redisV2Cache` activeInstance values) — only the shebang flag is in scope for unit 5.
- `redisV2Availability.ts:9` aliases the V2 monitor to V1 when `redisV2 === primaryRedis` — behavior to re-check when primary is repointed at Dragonfly.
