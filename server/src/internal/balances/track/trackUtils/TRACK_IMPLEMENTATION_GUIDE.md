# Track Implementation Guide

This guide explains how the track endpoint works from start to finish, including Redis-based tracking, PostgreSQL sync, and event management.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Request Flow](#request-flow)
4. [Redis Layer (Fast Path)](#redis-layer-fast-path)
5. [PostgreSQL Sync Layer](#postgresql-sync-layer)
6. [Event Management](#event-management)
7. [Concurrency & Race Conditions](#concurrency--race-conditions)
8. [Key Components](#key-components)

---

## Overview

The track endpoint records usage events for customers. It uses a **two-tier architecture**:

1. **Redis (Fast Path)**: Immediate, in-memory balance updates with sub-millisecond latency
2. **PostgreSQL (Sync Layer)**: Eventually consistent persistence with batching and deduplication

This design allows us to handle high-throughput tracking (20k+ req/s) while maintaining data consistency.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Track Request                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              handleTrack (handleTrack.ts)                    │
│  - Validates request                                         │
│  - Gets feature deductions                                   │
│  - Routes to Redis or Postgres                               │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   Redis Path        │         │   Postgres Path     │
│ (runRedisDeduction) │         │ (runDeductionTx)    │
└─────────────────────┘         └─────────────────────┘
            │                               │
            ▼                               │
┌─────────────────────┐                    │
│ BatchingManager     │                    │
│ - Lua script        │                    │
│ - Atomic ops        │                    │
└─────────────────────┘                    │
            │                               │
            ▼                               │
┌─────────────────────┐                    │
│ SyncBatchingManager │◄───────────────────┘
│ - Queues sync job   │
│ - 100ms window      │
└─────────────────────┘
            │
            ▼
┌─────────────────────┐
│ BullMQ Worker       │
│ (runSyncBalanceBatch)│
└─────────────────────┘
            │
            ▼
┌─────────────────────┐
│ syncItem.ts         │
│ - Reads Redis       │
│ - Updates Postgres  │
│ - Uses target_balance│
└─────────────────────┘
```

---

## Request Flow

### 1. Initial Validation
**File**: `handleTrack.ts`

```typescript
// Validates:
// - Customer exists
// - Feature exists
// - Event name mapping (if used)
// - Value is valid number
```

### 2. Feature Deduction Calculation
**File**: `getFeatureDeductions.ts`

```typescript
// Determines what to deduct:
// - Primary feature
// - Credit systems (if applicable)
// - Amount based on value parameter
```

### 3. Route Selection

**Redis Path** (default for most features):
- Fast, in-memory updates
- Lua script ensures atomicity
- Queues sync job for eventual persistence

**Postgres Path** (for specific features):
- Direct database updates
- Transactional consistency
- Used when immediate persistence required

---

## Redis Layer (Fast Path)

### How It Works

1. **Batching Manager** (`BatchingManager.ts`)
   - Accumulates track requests in memory
   - Executes Lua script every 10ms or when batch full
   - One atomic Redis operation per batch

2. **Lua Script** (`batchDeduction.lua`)
   - Runs atomically in Redis
   - Deducts from customer balances
   - Handles:
     - Rollovers (FIFO)
     - Breakdowns (monthly/lifetime)
     - Overage (if allowed)
     - Credit systems
   - Returns success/failure for each request

3. **Sync Trigger**
   - After successful Redis deduction
   - Adds (customerId, featureId) to sync batch
   - Deduplicated (multiple tracks = one sync)

### Redis Data Structure

```
org:env:customer:customerId               # Base customer
org:env:customer:customerId:features:featureId  # Feature hash
org:env:customer:customerId:features:featureId:breakdown:0  # Monthly
org:env:customer:customerId:features:featureId:breakdown:1  # Lifetime
org:env:customer:customerId:features:featureId:rollover:0   # Rollover 1
```

### Key Properties

- **Atomicity**: Lua script runs atomically
- **Performance**: Sub-millisecond latency
- **Consistency**: Single-threaded execution in Redis
- **Durability**: Eventually consistent (synced to Postgres)

---

## PostgreSQL Sync Layer

### Architecture

```
SyncBatchingManager (100ms window)
            ↓
   Queue to BullMQ Worker
            ↓
    runSyncBalanceBatch
            ↓
   syncItem (per customer/feature pair)
            ↓
  deductFromCusEnts (with target_balance)
            ↓
 performDeductionV2.sql (locks & calculates)
```

### Sync Process

**File**: `syncItem.ts`

```typescript
// 1. Read Redis balance (source of truth)
const redisCustomer = await getCachedApiCustomer({ customerId });

// 2. Get current Postgres data
const fullCus = await CusService.getFull({ customerId });

// 3. Call deduction with target_balance
await deductFromCusEnts({
    customerId,
    deductions: [{
        feature,
        deduction: 0,  // Not used
        targetBalance: redisCustomer.balance  // Redis is target
    }],
    refreshCache: false  // CRITICAL: Don't overwrite Redis!
});
```

### Target Balance Approach

**File**: `performDeductionV2.sql`

Instead of passing `amount_to_deduct`, sync passes `target_balance`:

```sql
-- Old approach (direct deduction)
amount_to_deduct = 100

-- New approach (target-based)
target_balance = redisBalance
amount_to_deduct = current_pg_balance - target_balance
```

**Benefits**:
1. Redis is single source of truth
2. Handles concurrent tracks correctly
3. Self-correcting (eventually consistent)

### Locking Strategy

**File**: `performDeductionV2.sql`

```sql
-- Lock ALL rows upfront (prevents deadlocks)
FOR ent_obj IN SELECT * FROM jsonb_array_elements(sorted_entitlements)
LOOP
    PERFORM 1 FROM customer_entitlements ce 
    WHERE ce.id = ent_id FOR UPDATE;
END LOOP;

FOR rollover_id IN SELECT unnest(rollover_ids)
LOOP
    PERFORM 1 FROM rollovers r 
    WHERE r.id = rollover_id FOR UPDATE;
END LOOP;
```

**Why upfront locking?**
- Prevents deadlocks by ensuring consistent lock order
- All locks acquired before any updates
- No lock acquisition during iteration

### Batching & Deduplication

**File**: `SyncBatchingManager.ts`

```typescript
// Deduplicates by (orgId, env, customerId, featureId)
// Multiple tracks = one sync
addSyncPair({ customerId, featureId, orgId, env });

// Flushes every 100ms or when 10k pairs accumulated
private readonly BATCH_WINDOW_MS = 100;
private readonly MAX_BATCH_SIZE = 10000;
```

---

## Event Management

### Event Batching

**File**: `EventBatchingManager.ts`

```typescript
// Similar to sync batching
// 100ms window, 5000 events max
addEvent({ customerId, eventName, value, timestamp });
```

### Event Insertion

**File**: `runInsertEventBatch.ts`

```typescript
// Batches event inserts to Postgres
// Looks up internal_customer_id
// Inserts all events in single query
await db.insert(events).values(eventInserts);
```

---

## Concurrency & Race Conditions

### Problem: Cache Refresh Race

**Scenario** (without fixes):
```
Time 0: Track req 1 deducts in Redis → balance: 99
Time 1: Track req 2 deducts in Redis → balance: 98
Time 2: Track req 1 commits to Postgres → balance: 99
Time 3: Track req 1 refreshes cache from Postgres → OVERWRITES Redis with 99!
Time 4: Track req 2 commits to Postgres → balance: 98
Time 5: Track req 2 refreshes cache → OVERWRITES Redis with 98!
Result: Redis loses intermediate updates!
```

**Solution**: Don't refresh cache from Postgres

```typescript
// In deductFromCusEnts
if (refreshCache) {
    await refreshCachedApiCustomer({ ctx, customerId });
}

// Normal track: refreshCache = true (default)
// Sync: refreshCache = false (Redis is source of truth)
```

### Problem: Concurrent Sync & Track

**Scenario**:
```
Time 0: Sync reads Redis: balance = 50
Time 1: Track updates Redis: balance = 49
Time 2: Sync calculates: amount = 100 - 50 = 50
Time 3: Sync updates Postgres: balance = 50
Time 4: Sync completes (wrong! should be 49)
```

**Solution**: Target balance approach
- Sync doesn't refresh cache, so Redis stays correct
- Next sync will read Redis = 49 and fix Postgres
- Eventually consistent

### Problem: Deadlocks

**Scenario**:
```
Transaction 1: Locks entitlement A, waits for entitlement B
Transaction 2: Locks entitlement B, waits for entitlement A
Result: Deadlock!
```

**Solution**: Lock all rows upfront
```sql
-- Step 0: Lock everything first
FOR ent_obj IN SELECT * FROM jsonb_array_elements(sorted_entitlements)
LOOP
    PERFORM 1 FROM customer_entitlements WHERE id = ent_id FOR UPDATE;
END LOOP;

-- Step 1: Calculate deduction
-- Step 2: Perform updates (already locked)
```

---

## Key Components

### Track Entry Point
- **`handleTrack.ts`**: Main endpoint handler
- **`getFeatureDeductions.ts`**: Calculates what to deduct

### Redis Layer
- **`runRedisDeduction.ts`**: Orchestrates Redis tracking
- **`BatchingManager.ts`**: Batches and executes Lua script
- **`batchDeduction.lua`**: Atomic deduction logic in Redis

### Sync Layer
- **`SyncBatchingManager.ts`**: Batches sync pairs
- **`runSyncBalanceBatch.ts`**: BullMQ worker
- **`syncItem.ts`**: Syncs single customer/feature
- **`performDeductionV2.sql`**: Postgres deduction with target_balance

### Deduction Logic
- **`runDeductionTx.ts`**: Postgres transaction wrapper
- **`deductFromCusEnts()`**: Main deduction function
- **`performDeductionV2.sql`**: SQL stored function
  - Two-pass strategy (zero, then negative)
  - Handles credit costs, rollovers, overage
  - Locks rows upfront

### Event Layer
- **`EventBatchingManager.ts`**: Batches events
- **`runInsertEventBatch.ts`**: Inserts events to Postgres

---

## Configuration

### Batching Windows

```typescript
// Redis batching (BatchingManager.ts)
private readonly batchWindow = 10; // 10ms

// Sync batching (SyncBatchingManager.ts)  
private readonly BATCH_WINDOW_MS = 100; // 100ms

// Event batching (EventBatchingManager.ts)
private readonly batchWindow = 100; // 100ms
```

### Batch Sizes

```typescript
// Redis: 1000 requests per batch
private readonly maxBatchSize = 1000;

// Sync: 10000 pairs per batch
private readonly MAX_BATCH_SIZE = 10000;

// Events: 5000 events per batch
private readonly maxBatchSize = 5000;
```

---

## Performance Characteristics

### Latency
- **Redis Track**: < 1ms (in-memory)
- **Postgres Track**: ~10-50ms (transaction + indexes)
- **Sync**: Eventually consistent (100ms+ delay)

### Throughput
- **Redis**: 20k+ req/s per customer
- **Postgres**: ~1k req/s per customer
- **Sync**: Handles arbitrary backlog

### Consistency
- **Redis**: Atomic per batch (Lua script)
- **Postgres**: Transactional
- **Overall**: Eventually consistent (Redis → Postgres)

---

## Testing

See `concurrent-track6.test.ts` for high-concurrency test:
- 25k concurrent requests
- Multiple customers
- Verifies Redis and Postgres consistency
- Tests with/without overage allowed

---

## Future Improvements

1. **Configurable sync frequency**: Allow per-org sync intervals
2. **Sync priority**: Prioritize certain customers/features
3. **Metrics**: Track sync lag, error rates
4. **Dead letter queue**: Handle failed syncs
5. **Backpressure**: Slow down tracks if sync lags too far

