# NEW_TRACK.md - Migration Plan: FullCustomer Cache for Track

## Overview

This document outlines the migration plan to move the Track endpoint from the dual cache system (`:customer:` + `:entity:` hash keys) to a single `:fullcustomer:` JSON key.

### Goals
1. Single source of truth - one cache key per customer
2. Easier observability and maintenance
3. Atomic operations on the FullCustomer JSON document
4. Simplified sync process

### Non-Goals (for this phase)
- Rollover deduction support
- Credit system deduction support
- Additional balance deduction
- Target balance / adjust granted balance functionality

---

## Architecture Comparison

### Current V1 Flow (Dual Cache)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           V1 BATCHING FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  handleTrack.ts                                                         │
│  └── Builds featureDeductions from feature_id or event_name             │
│           │                                                             │
│           ▼                                                             │
│  runTrackV2.ts                                                          │
│  └── getOrCreateCachedFullCustomer (reads :fullcustomer: JSON)          │
│  └── runRedisDeductionV2                                                │
│           │                                                             │
│           ▼                                                             │
│  runRedisDeductionV2.ts                                                 │
│  └── globalBatchingManager.deduct({                                     │
│        customerId, featureDeductions, orgId, env, entityId              │
│      })                                                                 │
│           │                                                             │
│           ▼                                                             │
│  BatchingManager.ts                                                     │
│  └── Batches requests by batchKey for 10ms window                       │
│      batchKey = entityId                                                │
│        ? buildCachedApiEntityKey(...)   // :customer:...:entity:...     │
│        : buildCachedApiCustomerKey(...) // :customer:...                │
│           │                                                             │
│           ▼                                                             │
│  executeBatchDeduction.ts                                               │
│  └── redis.batchDeduction(                                              │
│        JSON.stringify(requests),  // Array of {featureDeductions, ...}  │
│        orgId, env, customerId, adjustGrantedBalance                     │
│      )                                                                  │
│           │                                                             │
│           ▼                                                             │
│  batchDeduction.lua (V1)                                                │
│  └── Operates on :customer: hash keys                                   │
│      Uses HGET to read balance hashes                                   │
│      Uses HINCRBYFLOAT for atomic increments                            │
│      Handles entity balances via separate :entity: keys                 │
│      Returns {                                                          │
│        success, customerChanged, changedEntityIds,                      │
│        balances, modifiedBreakdownIds                                   │
│      }                                                                  │
│           │                                                             │
│           ▼                                                             │
│  runRedisDeductionV2.ts (continued)                                     │
│  └── queueSyncAndEvent() - queues Postgres sync                         │
│  └── Returns TrackResponseV2 with balances                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

SYNC FLOW (V1):
┌─────────────────────────────────────────────────────────────────────────┐
│  SyncBatchingManager.ts                                                 │
│  └── Batches sync pairs by customer (1000ms window)                     │
│  └── Queues to SQS with (customerId, featureId, entityId, breakdownIds) │
│           │                                                             │
│           ▼                                                             │
│  syncItem.ts                                                            │
│  └── getCachedApiCustomer/getCachedApiEntity (reads :customer: keys)    │
│  └── apiToBackendBalance() - converts ApiBalance to target balance      │
│  └── deductFromCusEnts({ targetBalance }) - syncs to Postgres           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Problems with V1:**
1. Two separate caches (`:fullcustomer:` and `:customer:`) can drift
2. Complex key structure with many hash keys per customer
3. Entity balances stored separately, harder to observe
4. `modifiedBreakdownIds` maps to the old `ApiBalance.breakdown` structure

---

### Target V2 Flow (Single FullCustomer Cache)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           V2 BATCHING FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  handleTrack.ts (unchanged)                                             │
│  └── Builds featureDeductions from feature_id or event_name             │
│           │                                                             │
│           ▼                                                             │
│  runTrackV2.ts (minor changes)                                          │
│  └── getOrCreateCachedFullCustomer (reads :fullcustomer: JSON)          │
│  └── runRedisDeductionV2                                                │
│           │                                                             │
│           ▼                                                             │
│  runRedisDeductionV2.ts (MODIFIED)                                      │
│  └── globalBatchingManager.deduct({                                     │
│        customerId, featureDeductions, orgId, env, entityId,             │
│        fullCustomer  // NEW: pass FullCustomer for building sorted ents │
│      })                                                                 │
│           │                                                             │
│           ▼                                                             │
│  BatchingManager.ts (MODIFIED)                                          │
│  └── Batches requests by customerId ONLY (not per-entity)               │
│      batchKey = buildFullCustomerCacheKey(orgId, env, customerId)       │
│      All entity deductions for same customer go in same batch           │
│           │                                                             │
│           ▼                                                             │
│  executeFullCustomerDeduction.ts (NEW)                                  │
│  └── buildSortedEntitlements() from FullCustomer + featureDeductions    │
│  └── redis.fullCustomerDeduction(                                       │
│        cacheKey,              // KEYS[1] - :fullcustomer: key           │
│        JSON.stringify(requests)                                         │
│      )                                                                  │
│           │                                                             │
│           ▼                                                             │
│  deductFromCustomerEntitlements.lua (MODIFIED - V2)                     │
│  └── Operates on :fullcustomer: JSON key                                │
│      Uses JSON.GET to read FullCustomer document                        │
│      Uses JSON.NUMINCRBY for atomic balance increments                  │
│      Entity balances at customer_entitlements[i].entities[entityId]     │
│      Returns {                                                          │
│        success, updates, changedCusEntIds                               │
│      }                                                                  │
│           │                                                             │
│           ▼                                                             │
│  runRedisDeductionV2.ts (continued)                                     │
│  └── queueSyncAndEvent() with changedCusEntIds (not breakdownIds)       │
│  └── Build response balances from Lua updates                           │
│  └── Returns TrackResponseV2 with balances                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

SYNC FLOW (V2):
┌─────────────────────────────────────────────────────────────────────────┐
│  SyncBatchingManager.ts (MODIFIED)                                      │
│  └── Batches sync pairs by customer (1000ms window)                     │
│  └── Queues to SQS with (customerId, featureId, entityId,               │
│                          changedCusEntIds)  // NEW field                │
│           │                                                             │
│           ▼                                                             │
│  syncItem.ts (MODIFIED)                                                 │
│  └── getCachedFullCustomer (reads :fullcustomer: JSON)                  │
│  └── fullCustomerToApiBalance() - converts to ApiBalance format         │
│  └── apiToBackendBalance() - converts to target balance                 │
│  └── deductFromCusEnts({ targetBalance }) - syncs to Postgres           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Redis Key Comparison

### V1 Keys (Hash-based)
```
{orgId}:env:customer:{version}:customerId                              # Base customer hash
{orgId}:env:customer:{version}:customerId:balances:{featureId}         # Balance hash
{orgId}:env:customer:{version}:customerId:balances:{featureId}:breakdown:{index}
{orgId}:env:customer:{version}:customerId:balances:{featureId}:rollover:{index}
{orgId}:env:customer:{version}:customerId:entity:{entityId}            # Entity base hash
{orgId}:env:customer:{version}:customerId:entity:{entityId}:balances:{featureId}
```

### V2 Key (JSON-based)
```
{orgId}:env:fullcustomer:{version}:customerId    # Single JSON document
```

### V2 JSON Structure
```json
{
  "id": "cus_123",
  "internal_id": "...",
  "customer_products": [
    {
      "id": "cp_456",
      "status": "active",
      "customer_entitlements": [
        {
          "id": "ce_789",
          "balance": 100,
          "adjustment": 0,
          "additional_balance": 0,
          "entities": {
            "entity_A": { "balance": 50, "adjustment": 0 },
            "entity_B": { "balance": 30, "adjustment": 0 }
          },
          "entitlement": {
            "feature": { "id": "api_calls", ... },
            "entity_feature_id": "ef_123",  // null if not entity-scoped
            ...
          }
        }
      ]
    }
  ],
  "entities": [
    { "id": "entity_A", ... },
    { "id": "entity_B", ... }
  ]
}
```

---

## File Changes

### New Files

| File | Description |
|------|-------------|
| `server/src/internal/balances/track/redisTrackUtils/executeFullCustomerDeduction.ts` | TypeScript wrapper to call V2 Lua script |
| `server/src/_luaScriptsV2/luaScriptsV2.ts` | Loader for V2 Lua scripts with dependency injection |

### Modified Files

| File | Changes |
|------|---------|
| `server/src/internal/balances/track/redisTrackUtils/BatchingManager.ts` | Batch by customer only, call V2 execution function |
| `server/src/internal/balances/track/redisTrackUtils/runRedisDeductionV2.ts` | Pass fullCustomer to batcher, handle new result format |
| `server/src/_luaScriptsV2/deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua` | Accept request array, use JSON.NUMINCRBY, return changedCusEntIds |
| `server/src/_luaScriptsV2/deductFromCustomerEntitlements/deductFromMainBalance.lua` | Return delta for NUMINCRBY instead of new value |
| `server/src/external/redis/initRedis.ts` | Register `fullCustomerDeduction` command |
| `server/src/internal/balances/utils/sync/SyncBatchingManager.ts` | Use changedCusEntIds instead of breakdownIds |
| `server/src/internal/balances/utils/sync/syncItem.ts` | Read from :fullcustomer: cache |

---

## Detailed Implementation

### Step 1: Create `executeFullCustomerDeduction.ts`

**Location:** `server/src/internal/balances/track/redisTrackUtils/executeFullCustomerDeduction.ts`

**Purpose:** TypeScript wrapper that:
1. Builds the `:fullcustomer:` cache key
2. Calls the V2 Lua script
3. Parses and returns results

**Interfaces:**

```typescript
// What we pass to each request in the batch
interface FullCustomerDeductionRequest {
  featureDeductions: { featureId: string; amount: number }[];
  overageBehavior: "cap" | "reject";
  entityId?: string;
  sortedEntitlements: LuaSortedEntitlement[];
}

// Pre-computed entitlement metadata for Lua
interface LuaSortedEntitlement {
  customer_entitlement_id: string;
  credit_cost: number;
  entity_feature_id: string | null;
  usage_allowed: boolean;
  min_balance: number | undefined;  // Floor (for overage)
  max_balance: number | undefined;  // Ceiling (for refunds)
}

// What Lua returns
interface FullCustomerDeductionResult {
  success: boolean;
  error?: "CUSTOMER_NOT_FOUND" | "INSUFFICIENT_BALANCE" | "PAID_ALLOCATED";
  updates: Record<string, CusEntUpdate>;
  changedCusEntIds: string[];
}

interface CusEntUpdate {
  balance: number;
  adjustment: number;
  entities: Record<string, { balance: number; adjustment: number }> | null;
  deducted: number;
}
```

**Key Function:**

```typescript
export const executeFullCustomerDeduction = async ({
  redis,
  requests,
  orgId,
  env,
  customerId,
}: {
  redis: Redis;
  requests: FullCustomerDeductionRequest[];
  orgId: string;
  env: string;
  customerId: string;
}): Promise<FullCustomerDeductionResult> => {
  const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });
  
  try {
    const result = await redis.fullCustomerDeduction(
      cacheKey,                    // KEYS[1]
      JSON.stringify(requests),    // ARGV[1]
    );
    
    return JSON.parse(result);
  } catch (error) {
    logger.error(`Error executing fullCustomerDeduction: ${error}`);
    return {
      success: false,
      error: "UNKNOWN_ERROR",
      updates: {},
      changedCusEntIds: [],
    };
  }
};
```

---

### Step 2: Create `buildSortedEntitlements` Helper

**Location:** Same file as above, or separate `buildSortedEntitlements.ts`

**Purpose:** Convert `FullCustomer` + `featureDeductions` into `LuaSortedEntitlement[]`

```typescript
export const buildSortedEntitlements = ({
  ctx,
  fullCustomer,
  featureDeductions,
  entityId,
}: {
  ctx: AutumnContext;
  fullCustomer: FullCustomer;
  featureDeductions: FeatureDeduction[];
  entityId?: string;
}): LuaSortedEntitlement[] => {
  const { org } = ctx;
  
  // 1. Get all relevant feature IDs (primary features only for basic track)
  const featureIds = featureDeductions.map(fd => fd.feature.id);
  
  // 2. Set entity on fullCustomer if entityId provided
  if (entityId) {
    fullCustomer.entity = fullCustomer.entities?.find(e => e.id === entityId);
  }
  
  // 3. Get sorted cusEnts using existing utility
  const cusEnts = cusProductsToCusEnts({
    cusProducts: fullCustomer.customer_products,
    featureIds,
    reverseOrder: org.config?.reverse_deduction_order,
    entity: fullCustomer.entity,
    inStatuses: orgToInStatuses({ org }),
  });
  
  // 4. Convert to Lua format
  return cusEnts.map(ce => {
    const cusPrice = cusEntToCusPrice({ cusEnt: ce });
    const maxOverage = getMaxOverage({ cusEnt: ce });
    const resetBalance = getStartingBalance({
      entitlement: ce.entitlement,
      options: getEntOptions(ce.customer_product.options, ce.entitlement),
      relatedPrice: cusPrice?.price,
      productQuantity: ce.customer_product.quantity,
    });
    
    return {
      customer_entitlement_id: ce.id,
      credit_cost: 1,  // Basic track - no credit system support yet
      entity_feature_id: ce.entitlement.entity_feature_id ?? null,
      usage_allowed: ce.usage_allowed ?? false,
      min_balance: maxOverage != null ? -maxOverage : undefined,
      max_balance: resetBalance,
    };
  });
};
```

---

### Step 3: Modify `BatchingManager.ts`

**Current behavior:** Batches by `customerId + entityId`
**New behavior:** Batches by `customerId` only

**Why:** The V2 Lua script handles multiple `entityId` values in one call. All deductions for a customer should go in the same Lua execution for atomicity.

**Changes:**

```typescript
// File: BatchingManager.ts

// ADD to deduct() params:
interface DeductParams {
  customerId: string;
  featureDeductions: FeatureDeduction[];
  orgId: string;
  env: string;
  entityId?: string;
  overageBehavior?: "cap" | "reject";
  fullCustomer: FullCustomer;  // NEW
}

// CHANGE batch key generation:
async deduct(params: DeductParams): Promise<DeductionResult> {
  const { customerId, orgId, env, fullCustomer } = params;
  
  // OLD:
  // const batchKey = entityId
  //   ? buildCachedApiEntityKey({ entityId, customerId, orgId, env })
  //   : buildCachedApiCustomerKey({ customerId, orgId, env });
  
  // NEW: Batch by customer only
  const batchKey = buildFullCustomerCacheKey({ orgId, env, customerId });
  
  // ... rest of batching logic
}

// CHANGE executeBatch() to call V2:
private async executeBatch(batchKey: string): Promise<void> {
  // ... get batch ...
  
  // OLD:
  // const result = await executeBatchDeduction({
  //   redis,
  //   requests: requests.map(r => ({
  //     featureDeductions: r.featureDeductions,
  //     overageBehavior: r.overageBehavior,
  //     entityId: batch.entityId,
  //   })),
  //   orgId: batch.orgId,
  //   env: batch.env,
  //   customerId: batch.customerId,
  // });
  
  // NEW: Build sorted entitlements and call V2
  const result = await executeFullCustomerDeduction({
    redis,
    requests: requests.map(r => ({
      featureDeductions: r.featureDeductions.map(fd => ({
        featureId: fd.featureId,
        amount: fd.amount,
      })),
      overageBehavior: r.overageBehavior,
      entityId: r.entityId,
      sortedEntitlements: buildSortedEntitlements({
        ctx: r.ctx,
        fullCustomer: r.fullCustomer,
        featureDeductions: r.featureDeductions,
        entityId: r.entityId,
      }),
    })),
    orgId: batch.orgId,
    env: batch.env,
    customerId: batch.customerId,
  });
  
  // ... resolve promises ...
}
```

**Note:** Each request in the batch may have a different `entityId`. The Lua script processes them sequentially within the atomic execution.

---

### Step 4: Modify V2 Lua Script

**File:** `_luaScriptsV2/deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua`

**Current state:**
- Uses `JSON.GET` to read FullCustomer
- Has `find_entitlement()` to locate cusEnt by ID
- Two-pass deduction (floor, then overage)
- `deductFromMainBalance` helper
- Uses `JSON.SET` (not atomic)
- Single request, not array
- Doesn't return `changedCusEntIds` array

**Changes needed:**

#### 4a. Accept array of requests

```lua
-- KEYS[1] = FullCustomer cache key
-- ARGV[1] = JSON array of requests

local cache_key = KEYS[1]
local requests = cjson.decode(ARGV[1])

-- Get FullCustomer once (shared across all requests)
local full_customer_json = redis.call('JSON.GET', cache_key, '.')
if not full_customer_json then
  return cjson.encode({ 
    success = false, 
    error = 'CUSTOMER_NOT_FOUND',
    updates = {},
    changedCusEntIds = {}
  })
end

local full_customer = cjson.decode(full_customer_json)
local all_updates = {}
local changed_cus_ent_ids = {}

-- Process each request
for _, request in ipairs(requests) do
  local result = process_single_request(request, full_customer)
  
  if not result.success then
    return cjson.encode(result)  -- Early exit on failure
  end
  
  -- Merge updates
  for cus_ent_id, update in pairs(result.updates) do
    all_updates[cus_ent_id] = update
    table.insert(changed_cus_ent_ids, cus_ent_id)
  end
end

return cjson.encode({
  success = true,
  updates = all_updates,
  changedCusEntIds = changed_cus_ent_ids
})
```

#### 4b. Use `JSON.NUMINCRBY` for atomic increments

```lua
-- OLD (in deductFromMainBalance or main script):
local new_balance = current_balance - deducted_amount
table.insert(pending_sets, { base_path .. '.balance', new_balance })
-- Later: redis.call('JSON.SET', cache_key, path, value)

-- NEW: Use JSON.NUMINCRBY for atomic increment
-- Instead of tracking pending_sets, apply immediately:
if deducted_amount ~= 0 then
  redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.balance', -deducted_amount)
  
  if has_entity_scope and target_entity_id then
    redis.call('JSON.NUMINCRBY', cache_key, 
      base_path .. '.entities.' .. target_entity_id .. '.balance', 
      -deducted_amount)
  end
  
  if alter_granted_balance then
    redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.adjustment', -deducted_amount)
  end
end
```

**Why JSON.NUMINCRBY:**
- Atomic: Multiple concurrent Lua executions won't lose updates
- Simpler: No need to read-compute-write
- Matches V1's `HINCRBYFLOAT` semantics

#### 4c. Handle unlimited entitlements

```lua
-- In process_single_request, before deduction:
-- Check if entitlement is unlimited
local entitlement = cus_ent.entitlement
if entitlement and entitlement.allowance_type == 'unlimited' then
  -- Skip deduction, mark as "changed" so balance gets returned
  table.insert(changed_cus_ent_ids, ent_id)
  -- Continue to next entitlement
end
```

#### 4d. Return structure

```lua
return cjson.encode({
  success = true,
  error = cjson.null,  -- or "INSUFFICIENT_BALANCE", "CUSTOMER_NOT_FOUND", "PAID_ALLOCATED"
  updates = {
    ["ce_123"] = {
      balance = 90,
      adjustment = 0,
      entities = { ["entity_A"] = { balance = 40, adjustment = 0 } },
      deducted = 10
    }
  },
  changedCusEntIds = { "ce_123", "ce_456" }
})
```

---

### Step 5: Register V2 Lua Script

**File:** `server/src/external/redis/initRedis.ts`

**Add:**

```typescript
import { getFullCustomerDeductionScript } from "../../_luaScriptsV2/luaScriptsV2.js";

// In configureRedisInstance():
redisInstance.defineCommand("fullCustomerDeduction", {
  numberOfKeys: 1,  // KEYS[1] = :fullcustomer: cache key
  lua: getFullCustomerDeductionScript(),
});
```

**File:** `server/src/_luaScriptsV2/luaScriptsV2.ts` (NEW)

```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load helper
const DEDUCT_FROM_MAIN_BALANCE = readFileSync(
  join(__dirname, "deductFromCustomerEntitlements/deductFromMainBalance.lua"),
  "utf-8",
);

// Load main script
const DEDUCT_FROM_CUSTOMER_ENTITLEMENTS = readFileSync(
  join(__dirname, "deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua"),
  "utf-8",
);

export function getFullCustomerDeductionScript(): string {
  return `${DEDUCT_FROM_MAIN_BALANCE}\n${DEDUCT_FROM_CUSTOMER_ENTITLEMENTS}`;
}
```

**Type definition in initRedis.ts:**

```typescript
declare module "ioredis" {
  interface RedisCommander {
    fullCustomerDeduction(
      cacheKey: string,       // KEYS[1]
      requestsJson: string,   // ARGV[1]
    ): Promise<string>;
  }
}
```

---

### Step 6: Modify `runRedisDeductionV2.ts`

**Changes:**

1. Pass `fullCustomer` to batching manager
2. Handle new result format (`changedCusEntIds` instead of `modifiedBreakdownIds`)
3. Build response balances from `updates`

```typescript
// In runRedisDeductionV2():

// CHANGE: Pass fullCustomer to deduct()
const result = await globalBatchingManager.deduct({
  customerId,
  featureDeductions: mappedDeductions,
  orgId: org.id,
  env,
  entityId,
  overageBehavior,
  fullCustomer,  // NEW
  ctx,           // NEW: needed for buildSortedEntitlements
});

// CHANGE: queueSyncAndEvent to use changedCusEntIds
const queueSyncAndEvent = ({
  ctx,
  trackParams,
  featureDeductions,
  eventInfo,
  result,
  apiCustomer,
}: ...) => {
  for (const deduction of featureDeductions) {
    if (result.changedCusEntIds && result.changedCusEntIds.length > 0) {
      globalSyncBatchingManager.addSyncPair({
        customerId: customer_id,
        featureId: deduction.feature.id,
        orgId: org.id,
        env,
        entityId: trackParams.entity_id,
        region: currentRegion,
        changedCusEntIds: result.changedCusEntIds,  // NEW (was breakdownIds)
      });
    }
  }
  // ... event batching unchanged
};
```

---

### Step 7: Modify `SyncBatchingManager.ts`

**Changes:**

```typescript
interface SyncPairContext {
  customerId: string;
  featureId: string;
  orgId: string;
  env: AppEnv;
  entityId?: string;
  region: string;
  timestamp: number;
  changedCusEntIds: string[];  // CHANGED from breakdownIds
}

// In addSyncPair():
addSyncPair({
  customerId,
  featureId,
  orgId,
  env,
  entityId,
  region,
  changedCusEntIds,  // CHANGED
}: Omit<SyncPairContext, "timestamp">): void {
  // ... existing batching logic
  
  const existingPair = customerBatch.pairs.get(pairKey);
  customerBatch.pairs.set(pairKey, {
    // ...
    changedCusEntIds: existingPair
      ? [...new Set([...existingPair.changedCusEntIds, ...changedCusEntIds])]
      : changedCusEntIds,
  });
}
```

---

### Step 8: Modify `syncItem.ts`

**Changes:**

1. Read from `:fullcustomer:` cache instead of `:customer:` cache
2. Convert FullCustomer balance format to ApiBalance for existing logic

```typescript
// In syncItem():

// OLD:
// if (entityId) {
//   const { apiEntity } = await getCachedApiEntity({...});
//   redisEntity = apiEntity;
// } else {
//   const { apiCustomer } = await getCachedApiCustomer({...});
//   redisEntity = apiCustomer;
// }

// NEW: Read from :fullcustomer: cache
const fullCustomer = await getCachedFullCustomer({
  orgId: item.orgId,
  env: item.env,
  customerId: item.customerId,
});

if (!fullCustomer) {
  ctx.logger.warn(`[syncItem] FullCustomer not found in cache: ${item.customerId}`);
  return;
}

// Convert to ApiBalance format for existing apiToBackendBalance logic
for (const relevantFeature of relevantFeatures) {
  const apiBalance = fullCustomerToApiBalance({
    fullCustomer,
    featureId: relevantFeature.id,
    entityId: item.entityId,
  });
  
  if (!apiBalance) continue;
  
  // ... rest of existing sync logic with apiToBackendBalance
}
```

**New helper function:**

```typescript
const fullCustomerToApiBalance = ({
  fullCustomer,
  featureId,
  entityId,
}: {
  fullCustomer: FullCustomer;
  featureId: string;
  entityId?: string;
}): ApiBalance | null => {
  // Find cusEnts for this feature
  const cusEnts = cusProductsToCusEnts({
    cusProducts: fullCustomer.customer_products,
    featureId,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
  });
  
  if (cusEnts.length === 0) return null;
  
  // Sum balances across all cusEnts for this feature
  let currentBalance = 0;
  let purchasedBalance = 0;
  let grantedBalance = 0;
  
  for (const cusEnt of cusEnts) {
    if (entityId && cusEnt.entitlement.entity_feature_id) {
      // Entity-scoped: get from entities map
      const entityBalance = cusEnt.entities?.[entityId];
      if (entityBalance) {
        currentBalance += entityBalance.balance || 0;
      }
    } else if (!cusEnt.entitlement.entity_feature_id) {
      // Customer-scoped: get from cusEnt directly
      currentBalance += cusEnt.balance || 0;
    }
    
    // TODO: Calculate purchased_balance, granted_balance from cusEnt
  }
  
  return {
    feature_id: featureId,
    current_balance: currentBalance,
    purchased_balance: purchasedBalance,
    granted_balance: grantedBalance,
    usage: grantedBalance - currentBalance + purchasedBalance,
    // ... other fields
  };
};
```

---

## Testing Plan

### Unit Tests

1. **`buildSortedEntitlements`:**
   - Returns correct order (entity vs customer, intervals, usage_allowed)
   - Handles missing entity
   - Handles empty customer_products

2. **`executeFullCustomerDeduction`:**
   - Returns success on valid deduction
   - Returns `CUSTOMER_NOT_FOUND` when cache empty
   - Returns `INSUFFICIENT_BALANCE` when reject + not enough balance

### Integration Tests

1. **Basic track (no entity):**
   - Single feature deduction
   - Multiple feature deductions in one request
   - Overage behavior: cap vs reject

2. **Entity-scoped track:**
   - Deduct from specific entity
   - Multiple entities, same customer, concurrent requests
   - Entity doesn't exist -> creates entity balance

3. **Batching:**
   - 100 concurrent requests for same customer -> all batched
   - Different customers -> separate batches

4. **Sync:**
   - Deduction -> sync -> Postgres matches Redis
   - Entity deduction -> correct entity balance in Postgres

---

## Open Questions

1. **Batching scope:** Currently planning to batch by `customerId` only. Confirm this is acceptable vs batching by `customerId + entityId`.

2. **Response balances:** Should `runRedisDeductionV2` return balances in the same `ApiBalance` format as V1? Or can we change the response structure?

3. **Fallback behavior:** If V2 Lua returns `CUSTOMER_NOT_FOUND`, should we:
   - A) Fall back to `executePostgresTracking` (current plan)
   - B) Try to populate cache and retry
   - C) Something else

4. **Credit system support timing:** The current plan doesn't include credit systems. When do we need this?

---

## Migration Strategy

1. **Phase 1 (this doc):** Basic track working with `:fullcustomer:` cache
2. **Phase 2:** Add rollover support to Lua script
3. **Phase 3:** Add credit system support
4. **Phase 4:** Add target_balance / adjust_granted_balance
5. **Phase 5:** Remove V1 cache code (`:customer:` keys)
