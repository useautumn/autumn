# Cloud repo (~/autumn/cloud) breakage audit (2026-08-04)

Cloud is a superset repo: `autumn` submodule (pinned to `staging`, currently `0f257e976`, 136 behind origin/dev) + cloud-only workspaces (`lib`, `scripts`, `scripts-v2`, `apps/{admin,migration-server,script-runner,test-runner,joe}`, `trigger/`, `infra/`, `tf/`). It **compiles server source directly** via bun workspaces + tsconfig paths (`@autumn/server/*` → `autumn/server/src/*`); the `bun ts` gate typechecks all workspaces. Docker images (`docker/*.Dockerfile`) `git clone --branch dev` the server repo at build time — server deletions on dev break the next image build regardless of the submodule pin.

## Export-compat contract for phase 1 (what server must keep)

| Symbol | Cloud consumers | Resolution |
|---|---|---|
| `deleteCachedFullCustomer` | 154 files (trigger `firecrawl-billing-controls.ts:507`, migration-server, admin handlers, lib services, ~120 scripts) | KEEP export + full signature. **`skipGuard` is passed by 2 callers** (`scripts-v2/runs/firecrawl/warm-fullsubject-cache/steps/warm-fullsubject-cache.ts:41`, `scripts-v2/runs/oneprep/unlimited-features/set-unlimited-features.ts:74`); `entityId`/`flushBalances` unused by cloud. Body → fullSubject invalidation only. |
| `updateCachedCustomerData` | migration-server `customerMiddleware.ts:94` (deployed), `scripts/src/firecrawl/fill-missing-customer-emails.ts:193`, `scripts-v2/.../sync-stripe-identity/utils/update-queue.ts:47` | KEEP as deprecated no-op stub. |
| `batchDeleteCachedFullCustomers` | `scripts/src/mintlify/import/workflow.ts:88,121` | KEEP as deprecated no-op stub (return 0). |
| `updateCusEntDbAndCache` | `scripts/src/mintlify/import/periodUsage.ts:569` | Live function anyway — only its legacy cache leg is removed. |
| `warmupRegionalRedis` | **13 files**, incl. boot paths `lib/src/createScriptContext.ts:140` (every scripts-v2 run) and `apps/admin/server/index.ts:81` | KEEP export name; reimplement as single-client warmup that still chains `warmupRedisV2()`. |
| `getRegionalRedis` | `scripts/src/common/migrations/perform-migration.ts:85` (direct registry import, passes bogus "us-east-1" — already resolves to primary) | KEEP deprecated shim returning the main client. |
| `waitForRedisReady` | 2 call sites (`assert-redis-ready.ts`, `perform-migration.ts:86`) | KEEP. |
| `getPrimaryRedis` | indirect: server `redisUtils.withLock` used by 2 migration-server handlers | KEEP (may become alias of main client). |

Safe to delete (zero cloud refs): `appendEntityToCache`, `updateEntityInCache`, `upsertInvoiceInCache`, `incrementCachedCusEntBalance`, `executeDeductionCache`/`executeResetCache` legacy legs, `testFullCustomerCacheGuard`, `pathIndex*`, all `_luaScripts` + registered V1 commands, `supportsUpstashShebang`, `getConfiguredRegions`, `getCacheUrlForRegion`, `currentRegion` (export), `PRIMARY_REGION`, `getRegionalRedisForInstance`, `getFallbackRedis`.

## Already broken in cloud today (pre-existing, fix in cloud later)

`getOrSetCachedFullCustomer` / `getCachedFullCustomer` no longer exist on server dev; dead imports at: migration-server `customerMiddleware.ts:2,107`, `syncMintlifyBilling.ts:5,425` (+test), `scripts-v2/runs/common/refresh-scale-plus-caches/steps/refresh-customer-cache.ts:4,130`, `scripts/src/checks/check-cache-sync.ts:2,66`.

## Behavioral fallout in cloud (silent no-ops after phase 1 — clean up in cloud repo)

- Scripts whose purpose is the V1 cache become no-ops: `scripts/src/common/{clear-cache,clear-plan-customers-cache,hatchet-clear-cache}.ts`, `scripts-v2/runs/common/refresh-scale-plus-caches/**`, `scripts-v2/runs/{runable/basic-dupes,interaction/reset-base-cost}/utils/delete-cached-customers.ts`.
- 6 scripts hardcode the `{org}:{env}:fullcustomer:1.0.0:*` key format with raw ioredis clients (`scripts/src/migrations/t3/*`, `scripts/src/initMigration/redis.ts:35`) — dead scans, not crashes.
- `scripts/src/firecrawl/import/index.ts:33` filters log lines containing `[updateCachedCustomerProduct]` — harmless dead filter.
- migration-server `customerMiddleware.test.ts:34` mocks the `updateCachedCustomerData` module path — stub keeps it compiling.

## Env / infra

- **No terraform, docker, or trigger deploy target sets any `CACHE_*` var** (trigger pulls the whole Infisical set; docker injects at runtime).
- `CACHE_URL_US_EAST` setters are local-only: `migrate/sebipaps:17`, `scripts/import/firecrawl-autumn-config.sh:16`. Staging preflight lists it as *optional* (`infra/src/load-tests/replay/loaders/assert-staging-replay-ready.ts:54`); staging doc says leave unset.
- ⚠️ `scripts-v2/runs/sebipaps/sandbox-product-sync/assert-local.ts:13` asserts `CACHE_URL_US_EAST` is local — behavior flips if the var disappears from local envs (cloud-side fix).
- Upstash: only prose/negative-test references; `RedisV2InstanceName` must keep its `upstash` member but `supportsUpstashShebang` is unreferenced.
- `trigger.config.ts` externalizes `ioredis` and registers a `.lua` esbuild loader — both still needed for V2; leave alone.
