-- accumulatorUtils.lua
-- Accumulator utility functions for managing deltas and state changes during deductions
-- These functions help reduce boilerplate by centralizing the recording of:
--   - Redis deltas (key/field/delta tuples)
--   - State changes (for customer or entity features)
--   - Modified breakdown IDs (for Postgres sync)
--
-- Context Object Structure:
-- local ctx = {
--     deltas = {},                  -- Array of {key, field, delta}
--     stateChanges = {},            -- Array of {target, entityId, cusFeature, changes[]}
--     modifiedBreakdownIds = {},    -- Array of breakdown IDs
--     adjustGrantedBalance = false  -- Global flag from ARGV[5]
-- }

-- ============================================================================
-- LOW-LEVEL PRIMITIVES
-- ============================================================================

-- Add a single delta to context
-- @param ctx table - The context object containing deltas array
-- @param key string - Redis key for the hash
-- @param field string - Field name within the hash
-- @param delta number - Delta value to record
local function recordDelta(ctx, key, field, delta)
    table.insert(ctx.deltas, {key = key, field = field, delta = delta})
end

-- Add a modified breakdown ID to context
-- @param ctx table - The context object containing modifiedBreakdownIds array
-- @param breakdownId string - The breakdown ID (customer_entitlement_id) that was modified
local function recordModifiedBreakdownId(ctx, breakdownId)
    if breakdownId then
        table.insert(ctx.modifiedBreakdownIds, breakdownId)
    end
end

-- Helper to find or create a state change entry for a cusFeature
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity", nil for customer
-- @param cusFeature table - The customer feature object
-- @return table - The state change entry with {target, entityId, cusFeature, changes[]}
local function getStateChangeEntry(ctx, target, entityId, cusFeature)
    -- Look for existing entry matching target, entityId, and cusFeature
    for _, entry in ipairs(ctx.stateChanges) do
        if entry.cusFeature == cusFeature and entry.target == target then
            -- For entity target, also check entityId matches
            if target == "entity" then
                if entry.entityId == entityId then
                    return entry
                end
            else
                return entry
            end
        end
    end
    
    -- Create new entry
    local newEntry = {
        target = target,
        entityId = entityId,
        cusFeature = cusFeature,
        changes = {}
    }
    table.insert(ctx.stateChanges, newEntry)
    return newEntry
end

-- Add a state change to customer or entity
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity", nil for customer
-- @param cusFeature table - The customer feature object to apply changes to
-- @param changeType string - "cusFeature", "breakdown", or "rollover"
-- @param index number|nil - Index for breakdown/rollover, nil for cusFeature
-- @param field string - Field name being changed
-- @param value number - The value (either newValue or delta depending on isNewValue)
-- @param isNewValue boolean - If true, value is an absolute newValue; if false, value is a delta
local function recordStateChange(ctx, target, entityId, cusFeature, changeType, index, field, value, isNewValue)
    local entry = getStateChangeEntry(ctx, target, entityId, cusFeature)
    
    local change = {
        type = changeType,
        field = field
    }
    
    -- Add index if provided (for breakdown/rollover)
    if index then
        change.index = index
    end
    
    -- Set either newValue or delta
    if isNewValue then
        change.newValue = value
    else
        change.delta = value
    end
    
    table.insert(entry.changes, change)
end

-- Record usage or granted_balance delta based on adjustGrantedBalance flag
-- Also records the corresponding state change
-- @param ctx table - The context object
-- @param key string - Redis key for the hash
-- @param delta number - Delta value (positive for usage/negative granted_balance)
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity"
-- @param cusFeature table - The customer feature object
-- @param stateType string - "cusFeature" or "breakdown"
-- @param index number|nil - Index for breakdown, nil for cusFeature
local function recordUsageOrGrantedBalance(ctx, key, delta, target, entityId, cusFeature, stateType, index)
    if ctx.adjustGrantedBalance then
        -- Decrement granted_balance instead of incrementing usage
        recordDelta(ctx, key, "granted_balance", -delta)
        recordStateChange(ctx, target, entityId, cusFeature, stateType, index, "granted_balance", -delta, false)
    else
        -- Normal case: increment usage
        recordDelta(ctx, key, "usage", delta)
        recordStateChange(ctx, target, entityId, cusFeature, stateType, index, "usage", delta, false)
    end
end

-- ============================================================================
-- HIGH-LEVEL CONVENIENCE FUNCTIONS
-- ============================================================================

-- Record deduction from a rollover balance
-- Updates: rollover.balance, cusFeature.current_balance, and usage/granted_balance
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity"
-- @param cusFeature table - The customer feature object with _key
-- @param rollover table - The rollover object with _key and balance
-- @param index number - Index of the rollover in cusFeature.rollovers array
-- @param amount number - Amount to deduct (positive value)
local function recordRolloverDeduction(ctx, target, entityId, cusFeature, rollover, index, amount)
    local rolloverBalance = rollover.balance or 0
    local newRolloverBalance = rolloverBalance - amount
    
    -- Rollover balance delta
    recordDelta(ctx, rollover._key, "balance", -amount)
    recordStateChange(ctx, target, entityId, cusFeature, "rollover", index, "balance", newRolloverBalance, true)
    
    -- CusFeature current_balance delta
    recordDelta(ctx, cusFeature._key, "current_balance", -amount)
    recordStateChange(ctx, target, entityId, cusFeature, "cusFeature", nil, "current_balance", -amount, false)
    
    -- Usage or granted_balance
    recordUsageOrGrantedBalance(ctx, cusFeature._key, amount, target, entityId, cusFeature, "cusFeature", nil)
end

-- Record deduction from a breakdown's current_balance
-- Updates: breakdown.current_balance, cusFeature.current_balance, and usage/granted_balance for both
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity"
-- @param cusFeature table - The customer feature object with _key
-- @param breakdown table - The breakdown object with _key, current_balance, id
-- @param index number - Index of the breakdown in cusFeature.breakdown array
-- @param amount number - Amount to deduct (positive for deduction, negative for refund)
-- @param newValue number - The new absolute value for breakdown.current_balance
local function recordBreakdownCurrentBalanceDeduction(ctx, target, entityId, cusFeature, breakdown, index, amount, newValue)
    -- Track which breakdown was modified
    recordModifiedBreakdownId(ctx, breakdown.id)
    
    -- Breakdown current_balance delta
    recordDelta(ctx, breakdown._key, "current_balance", -amount)
    recordStateChange(ctx, target, entityId, cusFeature, "breakdown", index, "current_balance", newValue, true)
    
    -- CusFeature current_balance delta
    recordDelta(ctx, cusFeature._key, "current_balance", -amount)
    recordStateChange(ctx, target, entityId, cusFeature, "cusFeature", nil, "current_balance", -amount, false)
    
    -- Usage or granted_balance for both breakdown and cusFeature
    recordUsageOrGrantedBalance(ctx, breakdown._key, amount, target, entityId, cusFeature, "breakdown", index)
    recordUsageOrGrantedBalance(ctx, cusFeature._key, amount, target, entityId, cusFeature, "cusFeature", nil)
end

-- Record deduction from cusFeature's current_balance (no breakdown)
-- Updates: cusFeature.current_balance and usage/granted_balance
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity"
-- @param cusFeature table - The customer feature object with _key, id
-- @param amount number - Amount to deduct (positive for deduction, negative for refund)
-- @param newValue number - The new absolute value for cusFeature.current_balance
local function recordCusFeatureCurrentBalanceDeduction(ctx, target, entityId, cusFeature, amount, newValue)
    -- Track which balance was modified
    recordModifiedBreakdownId(ctx, cusFeature.id)
    
    -- CusFeature current_balance delta
    recordDelta(ctx, cusFeature._key, "current_balance", -amount)
    recordStateChange(ctx, target, entityId, cusFeature, "cusFeature", nil, "current_balance", newValue, true)
    
    -- Usage or granted_balance
    recordUsageOrGrantedBalance(ctx, cusFeature._key, amount, target, entityId, cusFeature, "cusFeature", nil)
end

-- Record increment to breakdown's purchased_balance (overage)
-- Updates: breakdown.purchased_balance, cusFeature.purchased_balance, and usage/granted_balance for both
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity"
-- @param cusFeature table - The customer feature object with _key
-- @param breakdown table - The breakdown object with _key, id
-- @param index number - Index of the breakdown in cusFeature.breakdown array
-- @param amount number - Amount to increment (positive value)
local function recordBreakdownPurchasedBalanceIncrement(ctx, target, entityId, cusFeature, breakdown, index, amount)
    -- Track which breakdown was modified
    recordModifiedBreakdownId(ctx, breakdown.id)
    
    -- Breakdown purchased_balance delta
    recordDelta(ctx, breakdown._key, "purchased_balance", amount)
    recordStateChange(ctx, target, entityId, cusFeature, "breakdown", index, "purchased_balance", amount, false)
    
    -- CusFeature purchased_balance delta
    recordDelta(ctx, cusFeature._key, "purchased_balance", amount)
    recordStateChange(ctx, target, entityId, cusFeature, "cusFeature", nil, "purchased_balance", amount, false)
    
    -- Usage or granted_balance for both breakdown and cusFeature
    recordUsageOrGrantedBalance(ctx, breakdown._key, amount, target, entityId, cusFeature, "breakdown", index)
    recordUsageOrGrantedBalance(ctx, cusFeature._key, amount, target, entityId, cusFeature, "cusFeature", nil)
end

-- Record increment to cusFeature's purchased_balance (overage, no breakdown)
-- Updates: cusFeature.purchased_balance and usage/granted_balance
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity"
-- @param cusFeature table - The customer feature object with _key, id
-- @param amount number - Amount to increment (positive value)
local function recordCusFeaturePurchasedBalanceIncrement(ctx, target, entityId, cusFeature, amount)
    -- Track which balance was modified
    recordModifiedBreakdownId(ctx, cusFeature.id)
    
    -- CusFeature purchased_balance delta
    recordDelta(ctx, cusFeature._key, "purchased_balance", amount)
    recordStateChange(ctx, target, entityId, cusFeature, "cusFeature", nil, "purchased_balance", amount, false)
    
    -- Usage or granted_balance
    recordUsageOrGrantedBalance(ctx, cusFeature._key, amount, target, entityId, cusFeature, "cusFeature", nil)
end

-- Record overage refund from breakdown's purchased_balance
-- Updates: breakdown.purchased_balance, cusFeature.purchased_balance, and usage/granted_balance for both
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity"
-- @param cusFeature table - The customer feature object with _key
-- @param breakdown table - The breakdown object with _key, id
-- @param index number - Index of the breakdown in cusFeature.breakdown array
-- @param amount number - Amount to refund (positive value, will be negated internally)
local function recordBreakdownOverageRefund(ctx, target, entityId, cusFeature, breakdown, index, amount)
    -- Track which breakdown was modified
    recordModifiedBreakdownId(ctx, breakdown.id)
    
    -- Breakdown purchased_balance delta
    recordDelta(ctx, breakdown._key, "purchased_balance", -amount)
    recordStateChange(ctx, target, entityId, cusFeature, "breakdown", index, "purchased_balance", -amount, false)
    
    -- CusFeature purchased_balance delta
    recordDelta(ctx, cusFeature._key, "purchased_balance", -amount)
    recordStateChange(ctx, target, entityId, cusFeature, "cusFeature", nil, "purchased_balance", -amount, false)
    
    -- Usage or granted_balance for both (negated because it's a refund)
    recordUsageOrGrantedBalance(ctx, breakdown._key, -amount, target, entityId, cusFeature, "breakdown", index)
    recordUsageOrGrantedBalance(ctx, cusFeature._key, -amount, target, entityId, cusFeature, "cusFeature", nil)
end

-- Record overage refund from cusFeature's purchased_balance (no breakdown)
-- Updates: cusFeature.purchased_balance and usage/granted_balance
-- @param ctx table - The context object
-- @param target string - "customer" or "entity"
-- @param entityId string|nil - Required if target is "entity"
-- @param cusFeature table - The customer feature object with _key, id
-- @param amount number - Amount to refund (positive value, will be negated internally)
local function recordCusFeatureOverageRefund(ctx, target, entityId, cusFeature, amount)
    -- Track which balance was modified
    recordModifiedBreakdownId(ctx, cusFeature.id)
    
    -- CusFeature purchased_balance delta
    recordDelta(ctx, cusFeature._key, "purchased_balance", -amount)
    recordStateChange(ctx, target, entityId, cusFeature, "cusFeature", nil, "purchased_balance", -amount, false)
    
    -- Usage or granted_balance (negated because it's a refund)
    recordUsageOrGrantedBalance(ctx, cusFeature._key, -amount, target, entityId, cusFeature, "cusFeature", nil)
end

-- ============================================================================
-- CONTEXT INITIALIZATION HELPER
-- ============================================================================

-- Create a new context object for accumulating deduction results
-- @param adjustGrantedBalance boolean - If true, decrement granted_balance instead of incrementing usage
-- @return table - The initialized context object
local function createContext(adjustGrantedBalance)
    return {
        deltas = {},
        stateChanges = {},  -- Array of {target, entityId, cusFeature, changes[]}
        modifiedBreakdownIds = {},
        adjustGrantedBalance = adjustGrantedBalance or false
    }
end

