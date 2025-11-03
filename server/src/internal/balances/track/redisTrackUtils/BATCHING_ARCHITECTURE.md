# Batching Architecture

## Overview
The batching system collects multiple track requests for the same customer within a 10ms window and processes them atomically in a single Lua script execution.

## Location
All batching-related files are in `server/src/internal/balances/track/redisTrackUtils/`:
- `batchDeduction.lua` - Lua script (processes batch atomically)
- `BatchingManager.ts` - Collects requests and triggers batch execution
- `executeBatchDeduction.ts` - Executes Lua script
- `luaScripts.ts` - Loads Lua script at module initialization
- `runRedisDeduction.ts` - Entry point from track endpoint

## Data Flow

```
runRedisDeduction
  ↓ (featureDeductions: [{ featureId, amount }])
globalBatchingManager.deduct
  ↓ (batches by customerId)
executeBatchDeduction
  ↓ (single Lua script call)
batchDeduction.lua
  ↓ (processes all requests, accumulates deltas)
Redis HINCRBYFLOAT (one command per key per field)
```

## New Interface

### globalBatchingManager.deduct()
```typescript
{
  customerId: string,
  featureDeductions: [
    { featureId: "credits", amount: 10 },
    { featureId: "api_calls", amount: 5 }
  ],
  orgId: string,
  env: string,
  entityId?: string,
  overageBehavior: "cap" | "reject"
}
```

### Batching Key
```
org_id:env:customer:customer_id
```
- Batches by **customer only** (not per-feature)
- All requests for the same customer in a 10ms window are batched together

### Lua Script Input (ARGV[1])
```json
[
  {
    "featureDeductions": [
      { "featureId": "credits", "amount": 10 },
      { "featureId": "api_calls", "amount": 5 }
    ],
    "overageBehavior": "cap"
  },
  // ... more requests
]
```

### Lua Script Output
```json
{
  "success": true,
  "results": [
    { "success": true, "error": null },
    { "success": false, "error": "INSUFFICIENT_BALANCE" }
  ]
}
```

## Lua Script Structure

### Two Main Functions:

1. **processRequest(request)** - Handles one unit of request
   - Takes: `{ featureDeductions: [...], overageBehavior: "cap" }`
   - Loops through each feature deduction
   - Calculates deltas for each feature
   - Uses `addDelta()` to accumulate changes
   - Returns: `{ success: boolean, error?: string }`

2. **Top-level loop** - Processes all requests
   - Loops through all requests
   - Calls `processRequest()` for each
   - Applies all accumulated deltas at once with `redis.call("HINCRBYFLOAT", ...)`

## Delta Accumulation Pattern

```lua
-- Global accumulator
local keyDeltas = {}  -- { [redisKey][field] = delta }

-- Helper to add deltas
local function addDelta(key, field, delta)
    if not keyDeltas[key] then
        keyDeltas[key] = {}
    end
    keyDeltas[key][field] = (keyDeltas[key][field] or 0) + delta
end

-- Process requests (accumulate deltas in memory)
for _, request in ipairs(requests) do
    processRequest(request)  -- calls addDelta() internally
end

-- Apply all deltas (ONE Redis write per key per field)
for key, deltas in pairs(keyDeltas) do
    for field, delta in pairs(deltas) do
        redis.call("HINCRBYFLOAT", key, field, delta)
    end
end
```

## Performance Benefits

### Scenario: 1000 concurrent requests for same customer
- **Without batching**: 1000 Lua script calls, 6000 Redis writes (3 keys × 2 fields × 1000)
- **With batching**: 1 Lua script call, 6 Redis writes (3 keys × 2 fields)
- **Improvement**: ~1000x reduction in Redis writes! 🚀


