# Track Implementation Rules

This guide is concise and has no fluff. It prevents future coding agents from making mistakes with the track implementation.

## BatchingManager: Customer vs Entity Batching

**CRITICAL**: Batching must be atomic per customer AND per entity.

### Batch Key Construction
```typescript
// ❌ WRONG: Batches all deductions for a customer together
const batchKey = cacheKey; // customer cache key only

// ✅ CORRECT: Separate batches for customer-level vs each entity
const batchKey = entityId
	? buildCachedApiEntityKey({ entityId, customerId, orgId, env })
	: buildCachedApiCustomerKey({ customerId, orgId, env });
```

### Why This Matters
- **Customer-level deduction**: Batch under `{orgId}:env:customer:{customerId}`
- **Entity1 deduction**: Batch under `{orgId}:env:customer:{customerId}:entity:{entity1Id}`
- **Entity2 deduction**: Batch under `{orgId}:env:customer:{customerId}:entity:{entity2Id}`

Each batch executes atomically. Mixing customer and entity deductions in one batch breaks atomicity.

### Implementation Details
- `entityId` is stored at the **batch level**, not per-request
- All requests in a batch share the same `entityId` (or all are customer-level)
- The Lua script receives `batch.entityId` for all requests in that batch
- This ensures proper batching by entity and prevents mixed customer/entity batches

### Example
```typescript
// These should create 3 separate batches:
await track({ customer_id: "cus1", feature_id: "messages", value: 10 });        // Batch 1
await track({ customer_id: "cus1", entity_id: "ent1", feature_id: "messages", value: 5 });  // Batch 2
await track({ customer_id: "cus1", entity_id: "ent2", feature_id: "messages", value: 3 });  // Batch 3
```

## Redis vs Postgres Tracking

### single_use features → Redis only
- Deducted via `runRedisDeduction.ts` → `BatchingManager` → `batchDeduction.lua`
- **MUST** sync Redis → Postgres (only for changed scopes)
- Uses `globalSyncBatchingManager.addSyncPair()` based on `customerChanged` and `changedEntityIds`

### continuous_use features → Postgres first, then Redis
1. Deduct from Postgres via `runDeductionTx.ts`
2. Get actual deducted amount from SQL result (`actualDeductions`)
3. Deduct same amount from Redis cache via `deductFromCache.ts`
4. Uses direct Lua script call (no batching) to avoid race conditions

### Rule
Never sync in both directions. Single source of truth:
- `single_use` → Redis is source of truth, sync to Postgres for durability
- `continuous_use` → Postgres is source of truth, Redis is cache

## Unmerged Cache Access for Syncing

**CRITICAL**: When syncing from Redis to Postgres, fetch the unmerged balance for that specific scope.

### Problem
The default cache behavior merges balances:
- `getCustomer`: Returns customer + all entities merged
- `getEntity`: Returns entity + customer merged

This is correct for API responses, but WRONG for syncing because:
```typescript
// Customer has 10, Entity1 has 5, Entity2 has 5
// GET /customers/:id returns balance=20 (10+5+5) ✓ correct for API
// But when syncing customer-level, we need ONLY 10 (customer's own balance)
```

### Solution
Use `skipEntityMerge` / `skipCustomerMerge` flags when fetching for sync:

```typescript
// Syncing customer-level
const { apiCustomer } = await getCachedApiCustomer({
  ctx,
  customerId,
  skipEntityMerge: true, // Returns ONLY customer's balance (not merged with entities)
});

// Syncing entity-level
const { apiEntity } = await getCachedApiEntity({
  ctx,
  customerId,
  entityId,
  skipCustomerMerge: true, // Returns ONLY entity's balance (not merged with customer)
});
```

### Implementation
- `getCustomer.lua`: Accepts `ARGV[4]` as `skipEntityMerge` flag
- `getEntity.lua`: Accepts `ARGV[5]` as `skipCustomerMerge` flag
- `loadCusFeatures`: Special mode `"__CUSTOMER_ONLY__"` returns unmerged customer features

## Selective Sync: Preventing Unnecessary Syncs

**CRITICAL**: Only sync scopes that were actually modified.

### Problem
If every track queues a sync for customer + all entities, we get unnecessary syncs and potential race conditions:
```typescript
// ❌ WRONG: Always sync everything
track({ customer_id: "cus1", entity_id: "ent1", feature_id: "messages", value: 1 });
// Syncs: cus1, ent1 (but ent1 might not have changed if deduction came from customer balance!)
```

### Solution
`batchDeduction.lua` tracks which scopes were actually modified:
- `customerChanged`: Boolean flag for customer-level changes
- `changedEntityIds`: Array of entity IDs that had balance changes

```typescript
// ✅ CORRECT: Only sync what changed
const result = await deduct(...);
if (result.customerChanged) {
  addSyncPair({ customerId, featureId, entityId: undefined });
}
for (const entityId of result.changedEntityIds) {
  addSyncPair({ customerId, featureId, entityId });
}
```

### Examples
```typescript
// Customer-level track that deducts from customer balance only
track({ customer_id: "cus1", feature_id: "messages", value: 10 });
// Result: customerChanged=true, changedEntityIds=[]
// Syncs: cus1 only

// Entity-level track that deducts from entity first, then customer
track({ customer_id: "cus1", entity_id: "ent1", feature_id: "messages", value: 10 });
// Result: customerChanged=true, changedEntityIds=["ent1"]
// Syncs: cus1, ent1

// Entity-level track that only deducts from entity (customer has unlimited)
track({ customer_id: "cus1", entity_id: "ent1", feature_id: "messages", value: 10 });
// Result: customerChanged=false, changedEntityIds=["ent1"]
// Syncs: ent1 only
```

## Postgres Deduction Order

`performDeductionV2.sql` processes entitlements in the EXACT order they are passed in the `sorted_entitlements` array. The `jsonb_array_elements()` function preserves array order.

Use `reverseOrder` config to control deduction order:
- `reverseOrder: false` → Oldest entitlements first
- `reverseOrder: true` → Newest entitlements first

## Actual Deductions Tracking

When deducting from Postgres, always track the ACTUAL amount deducted (not the requested amount):

```typescript
// ❌ WRONG: Using requested amount
const requestedAmount = 10;
await deductFromCache({ amount: requestedAmount });

// ✅ CORRECT: Using actual deducted amount from SQL result
const result = await db.execute(sql`...`);
const actualDeducted = result.updates[entId].deducted;
actualDeductions[featureId] = actualDeducted;
await deductFromCache({ amount: actualDeducted });
```
