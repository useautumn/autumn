# Redis JSON Cache Layer - Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CACHE LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Storage: Redis JSON (FullCustomer object)                      │
│  Master: us-east (writes from attach/webhooks)                  │
│  Replicas: all regions (reads for track/check)                  │
├─────────────────────────────────────────────────────────────────┤
│  Write Patterns:                                                │
│  - Attach: JSON.SET full object                                 │
│  - Webhooks: JSON.SET with JSONPath (targeted updates)          │
│  - Track: JSON.NUMINCRBY via Lua (atomic balance deductions)    │
├─────────────────────────────────────────────────────────────────┤
│  Read Pattern:                                                  │
│  - getCachedFullCustomer: cache hit → return, miss → DB + set   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Cache Read/Write Foundation

**Goal**: Replace current cache layer with Redis JSON storing `FullCustomer`

### 1.1 New Lua Scripts

```
server/src/_luaScriptsV2/
├── fullCustomer/
│   ├── getFullCustomer.lua      # JSON.GET with fallback handling
│   ├── setFullCustomer.lua      # JSON.SET with version/guard checks
│   └── deleteFullCustomer.lua   # JSON.DEL with guard marker
```

### 1.2 New TypeScript Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `getCachedFullCustomer` | `server/src/internal/customers/cusUtils/fullCusCacheUtils/` | Read from cache or DB+set |
| `setCachedFullCustomer` | same | Write FullCustomer to cache |
| `deleteCachedFullCustomer` | same | Invalidate cache |
| `getOrCreateCachedFullCustomer` | same | Get or create, returns FullCustomer |

### 1.3 Integration Points

| Endpoint | Current | New |
|----------|---------|-----|
| `handleGetCustomerV2` | `getCachedApiCustomer` → ApiCustomer | `getCachedFullCustomer` → `fullCusToApiCustomer` |
| `handleCheck` | `getOrCreateApiCustomer` | `getOrCreateCachedFullCustomer` |
| `handleTrack` | `getOrCreateCustomer` | `getOrCreateCachedFullCustomer` |

### 1.4 Mapping Function

```typescript
// New: fullCusToApiCustomer.ts
// Takes FullCustomer, returns ApiCustomer
// Replaces cache-read logic in getApiCustomer.ts
```

---

## Phase 2: Atomic Balance Deductions (Track)

**Goal**: Lua script for atomic deductions matching `performDeduction.sql` logic

### 2.1 Lua Script Structure

```
server/src/_luaScriptsV2/
├── deduction/
│   ├── performDeduction.lua     # Main deduction orchestrator
│   ├── deductFromRollovers.lua  # Step 1: Rollover deduction
│   ├── deductFromAdditional.lua # Step 2: Additional balance
│   └── deductFromMain.lua       # Step 3: Main balance (2 passes)
```

### 2.2 Deduction Lua Script Outline

```lua
-- performDeduction.lua
-- Input: customerId, featureId, amount, entitlementIds[], overageBehavior
-- Output: { updates: {entId: {balance, adjustment, deducted}}, remaining }

-- 1. Get current balances via JSON.GET $.customer_products[*].customer_entitlements[?(@.id in entIds)]
-- 2. Calculate deductions (same logic as SQL)
-- 3. Apply via JSON.NUMINCRBY for each affected balance
-- 4. Return updated values + breakdown IDs for sync
```

### 2.3 Sync Function

```typescript
// syncItemV3.ts
// Input: customerId, updatedEntitlementIds[], region
// 1. Read balances from Redis for those entitlement IDs
// 2. UPDATE customer_entitlements SET balance=X, adjustment=Y, entities=Z WHERE id IN (...)
```

### 2.4 Integration

| Current | New |
|---------|-----|
| `runRedisDeduction` → Lua scripts | `runRedisDeductionV2` → new Lua |
| `syncItemV2` | `syncItemV3` (reads from Redis JSON) |

---

## Phase 3: Cache Invalidation (Initial)

**Goal**: Simple invalidation on structural changes (attach/webhooks)

### 3.1 Invalidation Points

| Operation | Action |
|-----------|--------|
| Attach (success) | `deleteCachedFullCustomer` |
| Stripe webhook (structural) | `deleteCachedFullCustomer` |
| Reset (cron) | `deleteCachedFullCustomer` |

### 3.2 Future: Targeted Updates (Phase 4)

```typescript
// Later: Use JSONPath for surgical updates instead of full invalidation
await redis.json.set(key, '$.invoices[?(@.stripe_id=="inv_123")].status', '"paid"');
```

---

## Data Flow Summary

```
GET CUSTOMER:
  getCachedFullCustomer()
    → cache hit? return FullCustomer
    → cache miss? CusService.getFull() → setCachedFullCustomer() → return
  → fullCusToApiCustomer()
  → return ApiCustomer

CHECK/TRACK:
  getOrCreateCachedFullCustomer()
    → getCachedFullCustomer() or create new
  → performDeduction.lua (atomic in Redis)
  → queue syncItemV3 job
  → return response

ATTACH:
  [existing attach logic]
  → deleteCachedFullCustomer()

WEBHOOK:
  [existing webhook logic]
  → deleteCachedFullCustomer()
```

---

## File Checklist

### New Lua Scripts (`server/src/_luaScriptsV2/`)

- [ ] `fullCustomer/getFullCustomer.lua`
- [ ] `fullCustomer/setFullCustomer.lua`
- [ ] `fullCustomer/deleteFullCustomer.lua`
- [ ] `deduction/performDeduction.lua`
- [ ] `deduction/deductFromRollovers.lua`
- [ ] `deduction/deductFromAdditional.lua`
- [ ] `deduction/deductFromMain.lua`

### New TypeScript (`server/src/internal/customers/cusUtils/fullCusCacheUtils/`)

- [ ] `getCachedFullCustomer.ts`
- [ ] `setCachedFullCustomer.ts`
- [ ] `deleteCachedFullCustomer.ts`
- [ ] `getOrCreateCachedFullCustomer.ts`
- [ ] `fullCusToApiCustomer.ts`

### New Sync (`server/src/internal/balances/utils/sync/`)

- [ ] `syncItemV3.ts`

### New Track (`server/src/internal/balances/track/`)

- [ ] `runRedisDeductionV2.ts`

---

## Notes

- Do NOT modify existing functions (except replacing them in top-level callers)
- All new Lua scripts go in `_luaScriptsV2/`
- Phase 3 uses simple invalidation; targeted JSONPath updates come later

---

## ⚠️ Important Notes

### Use RedisJSON Commands, NOT Regular SET/GET

When storing FullCustomer in Redis, **you MUST use RedisJSON commands** (`JSON.SET`, `JSON.GET`), not regular `SET`/`GET` with `JSON.stringify`.

**Why?**
- Phase 2 requires JSONPath operations (`JSON.NUMINCRBY`, `JSON.GET $.path`) for atomic deductions
- Regular `SET` stores JSON as a string blob - you cannot use JSONPath on it
- RedisJSON stores JSON natively, enabling partial reads/writes

**Correct:**
```typescript
// Write
await redis.call("JSON.SET", cacheKey, "$", JSON.stringify(fullCustomer));
await redis.expire(cacheKey, TTL_SECONDS);

// Read
const result = await redis.call("JSON.GET", cacheKey);

// Check exists
const exists = await redis.call("JSON.TYPE", cacheKey);
```

**Wrong:**
```typescript
// ❌ This stores JSON as a string - JSONPath won't work!
await redis.set(cacheKey, JSON.stringify(fullCustomer), "EX", TTL_SECONDS);
await redis.get(cacheKey);
```
