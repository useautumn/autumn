# V2 Full Customer Cache — Handoff Prompt

Use this prompt in a new agent conversation to continue the implementation.

---

## Prompt

Read the following plans before starting:
- `.plans/v2-full-customer-cache.md` — high-level architecture and phases
- `.plans/v2-cache-invalidation-indexes.md` — cache invalidation + missing Postgres indexes
- `.cursor/plans/v2_full_customer_query_49c5cc3a.plan.md` — comprehensive research (rolling migration details, billing action constraints, Postgres gotchas, Redis best practices)

### Problem

The current `FullCustomer` object stored in Redis as a single JSON blob grows unboundedly with entities. For a customer with N entities, the blob includes N entity-scoped `customer_products` (each with nested entitlements, prices). Our largest customer has ~76 entities, producing a ~4MB blob. This causes `JSON.GET`/`JSON.SET` latency spikes on Redis.

### Solution: Bounded FullCustomer + Per-Entity FullEntity

Split into two cache objects:

**Bounded FullCustomer** — cached at `{orgId}:env:fullcustomer:2.0.0:customerId`
- Contains only customer-level products (`internal_entity_id IS NULL`)
- Contains aggregated entity balance data (from V2 query's entity aggregation CTEs)
- Contains entities array, subscriptions, invoices
- For our largest customer, this is ~10KB

**FullEntity** — cached at `{orgId}:env:fullentity:1.0.0:customerId:entityId`
- Contains entity-scoped products (`internal_entity_id = this entity`) PLUS inherited customer-level products (`internal_entity_id IS NULL`)
- Entity inheritance is critical: in default mode (`org.config.entity_product !== true`), `filterCusProductsByEntity` in `shared/utils/cusProductUtils/filterCusProductUtils.ts` includes both entity-scoped and customer-level products
- Contains entity record, customer core fields (processor, billing controls, fingerprint)
- Contains extra_customer_entitlements matching this entity
- For our largest entity, this is ~105KB (11 products, 22 entitlements)
- Does NOT contain: other entities' data, aggregated data, invoices, subscriptions

### Key Design Decisions (already finalized)

1. **Same nested `FullCustomer` shape everywhere** — the cache stores the exact same nested `customer_products[].customer_entitlements[]` structure used in TypeScript in-memory. No flat/normalized format. No hydrate/dehydrate layer. The path index stays as-is.

2. **Lua scripts are key-agnostic** — the existing deduction Lua scripts (`deductFromCustomerEntitlements.lua`) accept a `cache_key` and `pathidx_key`. For entity operations, just pass the entity cache key and entity path index key instead of the customer ones. No Lua script changes needed.

3. **Size cap safety net** — if a serialized entity/customer doc exceeds 500KB, skip caching and fall back to Postgres. This guarantees Redis objects are never unbounded.

4. **Billing actions (attach, updateSubscription) are OUT OF SCOPE** — they need ALL customer products across ALL entities for Stripe subscription merging (`buildStripeSubscriptionItemsUpdate` diffs all products on a subscription). Billing actions will continue to query Postgres directly via `CusService.getFull`. After billing, invalidate all customer + entity caches.

5. **Rolling migration via percentage-based hashing** — cherry-pick `getCustomerBucket(customerId)` and `resolveCustomerId` middleware from `origin/feat/custom-redis`. Use `Bun.hash(customerId) % 100` to deterministically route customers to V1 or V2 cache format. Deploy at 0%, ramp 5 → 10 → 25 → 50 → 75 → 100. Staleness detection (`isCacheStale` pattern) invalidates old-format cache when a customer's routing flips due to percentage change.

### Existing V2 Query Work

The SQL layer is already built:
- `server/src/internal/customers/repos/sql/getSubjectCoreQuery.ts` — flat normalized CTE query. Handles both customer-level (no `entityId`) and entity-level (with `entityId`) modes.
- `server/src/internal/customers/repos/getFullCustomerV2/resultToFullCustomer.ts` — TypeScript hydration from flat query rows to nested `FullCustomer`
- `server/src/internal/customers/repos/getFullCustomerV2.ts` — repo function

**CRITICAL GAP**: The current `getSubjectCoreQuery` with `entityId` only fetches entity-scoped products (`cp.internal_entity_id = entity.internal_id`). It does NOT include customer-level products (`internal_entity_id IS NULL`). This must be updated so the entity query returns BOTH — supporting the inheritance model where entities inherit customer-level products.

### How Endpoints Use the FullCustomer Today

**check/track (hot path, 1-5K req/sec):**
- Fetches FullCustomer from cache via `getOrSetCachedFullCustomer`
- `prepareFeatureDeduction` calls `fullCustomerToCustomerEntitlements` which flattens `customer_products[].customer_entitlements` + `extra_customer_entitlements` into a single array, filtered by entity via `cusEntMatchesEntity`
- Lua deduction uses path index for O(1) sub-path reads — never reads the full doc
- After deduction, `applyDeductionUpdateToFullCustomer` directly walks `customer_products[i].customer_entitlements[j]` to mutate in-place

**getCustomer:**
- Fetches FullCustomer, calls `getApiCustomerBase` which builds subscriptions (from `customer_products`), balances (from `fullCustomerToCustomerEntitlements`), and flags
- Also returns entities array, invoices, billing controls

**getEntity:**
- Currently fetches the ENTIRE FullCustomer, then calls `filterCusProductsByEntity` to get entity-relevant products
- After the V2 split: fetches FullEntity directly (already contains the filtered products)

### Implementation Phases

**Phase 0 — Comparison Tests (do first)**
Write integration tests that:
- Set up a customer with multiple entities, each with products/entitlements/balances
- Call `getOrCreateCustomer` and `getEntity` endpoints
- Snapshot the `subscriptions` array and `balances` object (minus `breakdown` field)
- These tests serve as the baseline — after the V2 rollout, re-run and assert equivalence
- Use existing test infrastructure (read `server/tests/_guides/general-test-guide.md` first)

**Phase 1 — FullEntity type + cache utilities**
- Create `FullEntity` type in `shared/models/cusModels/fullEntityModel.ts`
- Create entity cache utilities in `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/`: `getCachedFullEntity.ts`, `setCachedFullEntity.ts`, `deleteCachedFullEntity.ts`, `getOrSetCachedFullEntity.ts`
- Entity path index at `{orgId}:env:fullentity:pathidx:customerId:entityId`
- Update `fullCustomerCacheConfig.ts`: bump customer cache version to `2.0.0`, add entity cache config

**Phase 2 — Wire V2 query into CusService**
- Add `CusService.getFullV2` — calls `getSubjectCoreQuery` + `resultToFullCustomer` (customer-level, no entityId)
- Fix `getSubjectCoreQuery` entity mode — include `internal_entity_id IS NULL` products alongside entity-scoped ones
- Add `CusService.getFullEntity` — calls updated query with entityId, hydrates to FullEntity
- Update `getOrSetCachedFullCustomer` to use V2 query on cache miss
- Create `getOrSetCachedFullEntity` for entity-specific cache flow

**Phase 3 — Endpoint Migration**
- `/check`: if `entity_id` → `getOrSetCachedFullEntity`, else → bounded `getOrSetCachedFullCustomer`
- `/track`: same routing as check
- `/customers.get`: bounded FullCustomer (V2 query provides aggregated entity data)
- `/entities.get`: FullEntity directly (no more fetch-all-then-filter)
- Dual-cache deduction: inherited customer entitlements are embedded in entity cache. Deductions update the entity cache copy. Sync writes to Postgres from entity cache. Customer cache refreshes on next miss.

**Phase 4 — syncItemV3 Compatibility**
- Sync message includes `entityId` (or cache key info)
- Entity-scoped cusEnts → read from entity cache
- Customer-level cusEnts → read from customer cache
- `sync_balances_v2` Postgres function unchanged

**Phase 5 — Rolling Migration**
- Cherry-pick from `origin/feat/custom-redis`:
  - `getCustomerBucket(customerId)` from `server/src/external/redis/customerRedisRouting.ts` — `Bun.hash(id) % 100`
  - `resolveCustomerId` middleware from `server/src/honoMiddlewares/utils/resolveCustomerId.ts`
  - `isCacheStale()` pattern
- Add `resolveCacheVersion()` function: bucket < migrationPercent → V2, else → V1
- Wire into all cache read/write paths
- V1 path: existing single-blob FullCustomer (`fullcustomer:1.0.0`)
- V2 path: bounded FullCustomer (`fullcustomer:2.0.0`) + per-entity FullEntity (`fullentity:1.0.0`)

### Key Files Reference

**Existing files to understand:**
- `shared/models/cusModels/fullCusModel.ts` — FullCustomer type
- `shared/models/cusProductModels/cusProductModels.ts` — FullCusProduct, CusProduct types
- `shared/models/cusProductModels/cusEntModels/cusEntModels.ts` — FullCustomerEntitlement type
- `shared/utils/cusProductUtils/filterCusProductUtils.ts` — `filterCusProductsByEntity` (entity inheritance logic)
- `shared/utils/cusUtils/fullCusUtils/fullCustomerToCustomerEntitlements.ts` — flattens products + extra entitlements
- `shared/utils/cusEntUtils/filterCusEntUtils.ts` — `cusEntMatchesEntity`
- `server/src/internal/customers/CusService.ts` — current getFull
- `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/` — all cache utilities
- `server/src/internal/customers/cache/pathIndex/buildPathIndex.ts` — path index builder
- `server/src/_luaScriptsV2/fullCustomer/fullCustomerUtils.lua` — path index reader in Lua
- `server/src/_luaScriptsV2/deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua` — deduction hot path
- `server/src/internal/balances/utils/deduction/applyDeductionUpdateToFullCustomer.ts` — post-deduction mutation
- `server/src/internal/balances/utils/sync/syncItemV3.ts` — Redis → Postgres sync

**Files to create:**
- `shared/models/cusModels/fullEntityModel.ts`
- `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullEntity.ts`
- `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/setCachedFullEntity.ts`
- `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullEntity.ts`
- `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullEntity.ts`
- Test files in `server/tests/`

**Files to modify:**
- `server/src/internal/customers/repos/sql/getSubjectCoreQuery.ts` — entity query must include customer-level products
- `server/src/internal/customers/CusService.ts` — add getFullV2, getFullEntity
- `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.ts` — bump version, add entity config
- `server/src/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.ts` — use V2 query
- `server/src/internal/api/check/handleCheck.ts` — entity-aware cache routing
- `server/src/internal/balances/handlers/handleTrack.ts` — entity-aware cache routing
- `server/src/internal/customers/handlers/handleGetOrCreateCustomer/handleGetOrCreateCustomerV2.ts` — bounded FullCustomer
- `server/src/internal/entities/handlers/handleGetEntity/handleGetEntityV2.ts` — FullEntity
- `server/src/internal/balances/utils/sync/syncItemV3.ts` — entity cache awareness

### Start with Phase 0 — comparison tests.
