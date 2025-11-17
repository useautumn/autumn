-- batchDeduction.lua
-- Atomically processes a batch of track requests for a customer
-- Each request can deduct from multiple features
--
-- ARGV[1]: JSON array of requests:
--   [
--     {
--       featureDeductions: [{ featureId: "credits", amount: 10 }, ...],
--       overageBehavior: "cap" | "reject",
--       syncMode: boolean (optional) - If true, sync cache to targetBalance instead of deducting
--       targetBalance: number (optional) - Target balance for sync mode (per feature)
--       entityId: string (optional) - Entity ID for entity-level tracking
--     },
--     ...
--   ]
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id
-- ARGV[5]: adjust_granted_balance (optional, "true" to decrement granted_balance instead of incrementing usage)

local requestsJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]
local adjustGrantedBalance = ARGV[5] == "true"

-- Build versioned customer cache key using shared utility
local cacheKey = buildCustomerCacheKey(orgId, env, customerId)

-- Parse requests
local requests = cjson.decode(requestsJson)

-- Check if customer exists
local customerExists = redis.call("EXISTS", cacheKey)
if customerExists == 0 then
    -- For sync mode requests, skip silently (cache will be populated lazily)
    local allSyncMode = true
    for _, request in ipairs(requests) do
        if not request.syncMode then
            allSyncMode = false
            break
        end
    end
    
    if allSyncMode then
        -- All requests are sync mode - return success without doing anything
        local syncResults = {}
        for i = 1, #requests do
            table.insert(syncResults, { success = true })
        end
        return cjson.encode({
            success = true,
            results = syncResults
        })
    end
    
    -- At least one regular deduction - return error
    return cjson.encode({
        success = false,
        error = "CUSTOMER_NOT_FOUND",
        results = {}
    })
end

-- ============================================================================
-- GLOBAL STATE
-- ============================================================================

-- Global delta accumulator: { [redisKey][field] = delta }
local keyDeltas = {}

-- Track which entities were modified (set: { [entityId] = true })
local changedEntityIds = {}

-- Track if customer (base customer, not entity) was modified
local customerChanged = false

-- Track which featureIds were changed (for reloading balances)
-- { [featureId] = true } for customer-level changes
local changedCustomerFeatureIds = {}

-- Track which entity featureIds were changed: { [entityId] = { [featureId] = true } }
local changedEntityFeatureIds = {}

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Helper: Add delta to accumulator
local function addDelta(key, field, delta)
    if not keyDeltas[key] then
        keyDeltas[key] = {}
    end
    keyDeltas[key][field] = (keyDeltas[key][field] or 0) + delta
end


-- ============================================================================
-- VALIDATION
-- ============================================================================

-- No validation function needed - we try deduction and check remaining

-- ============================================================================
-- CORE DEDUCTION LOGIC
-- ============================================================================

-- Deduct from rollover balances - returns deltas without modifying cusFeature
-- Parameters:
--   cusFeature: Balance object to deduct from
--   amount: Amount to deduct
--   adjustGrantedBalance: If true, decrement granted_balance instead of incrementing usage
-- Returns: { remaining: number, deltas: [{key, field, delta}], stateChanges: [{type, index, field, newValue}] }
local function deductFromRollovers(cusFeature, amount, adjustGrantedBalance)
    local remaining = amount
    local deltas = {}
    local stateChanges = {}
    
    -- Deduct from each rollover
    for index, rollover in ipairs(cusFeature.rollovers or {}) do
        if remaining <= 0 then break end
        
        local rolloverBalance = rollover.balance or 0
        if rolloverBalance > 0 then
            local toDeduct = math.min(remaining, rolloverBalance)
            
            -- Collect Redis deltas
            table.insert(deltas, {key = rollover._key, field = "balance", delta = -toDeduct})
            table.insert(deltas, {key = cusFeature._key, field = "current_balance", delta = -toDeduct})
            
            -- Either increment usage or decrement granted_balance based on flag
            if adjustGrantedBalance then
                table.insert(deltas, {key = cusFeature._key, field = "granted_balance", delta = -toDeduct})
            else
                table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toDeduct})
            end
            
            -- Collect state changes
            table.insert(stateChanges, {
                type = "rollover",
                index = index,
                field = "balance",
                newValue = rolloverBalance - toDeduct
            })
            table.insert(stateChanges, {
                type = "cusFeature",
                field = "current_balance",
                delta = -toDeduct
            })
            if adjustGrantedBalance then
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "granted_balance",
                    delta = -toDeduct
                })
            else
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "usage",
                    delta = toDeduct
                })
            end
            
            remaining = remaining - toDeduct
        end
    end
    
    return {
        remaining = remaining,
        deltas = deltas,
        stateChanges = stateChanges
    }
end

-- Deduct from current_balance (first pass - only deducts from positive balances)
-- current_balance can NEVER go below 0
-- Parameters:
--   cusFeature: Balance object to deduct from
--   amount: Amount to deduct (can be negative for refunds)
--   adjustGrantedBalance: If true, decrement granted_balance instead of incrementing usage
-- Returns: { remaining: number, deltas: [{key, field, delta}], stateChanges: [{type, index, field, newValue/delta}] }
local function deductFromCurrentBalance(cusFeature, amount, adjustGrantedBalance)
    local remaining = amount
    local deltas = {}
    local stateChanges = {}
    
    -- If cusFeature has breakdowns, deduct from breakdown current_balances
    if cusFeature.breakdown and #cusFeature.breakdown > 0 then
        for index, breakdown in ipairs(cusFeature.breakdown) do
            if remaining == 0 then break end
            
            local breakdownCurrentBalance = breakdown.current_balance or 0
            -- For refunds (negative amount), always apply. For deductions, only if balance > 0
            if remaining < 0 or breakdownCurrentBalance > 0 then
                -- Calculate how much we can deduct (ensure current_balance never goes below 0)
                local maxDeductible = breakdownCurrentBalance
                local toDeduct = math.min(remaining, maxDeductible)
                
                -- Collect Redis deltas
                table.insert(deltas, {key = breakdown._key, field = "current_balance", delta = -toDeduct})
                table.insert(deltas, {key = cusFeature._key, field = "current_balance", delta = -toDeduct})
                
                -- Either increment usage or decrement granted_balance based on flag
                if adjustGrantedBalance then
                    table.insert(deltas, {key = breakdown._key, field = "granted_balance", delta = -toDeduct})
                    table.insert(deltas, {key = cusFeature._key, field = "granted_balance", delta = -toDeduct})
                else
                    table.insert(deltas, {key = breakdown._key, field = "usage", delta = toDeduct})
                    table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toDeduct})
                end
                
                -- Collect state changes
                local newBalance = breakdownCurrentBalance - toDeduct
                -- Ensure current_balance never goes below 0
                if newBalance < 0 then
                    newBalance = 0
                end
                
                table.insert(stateChanges, {
                    type = "breakdown",
                    index = index,
                    field = "current_balance",
                    newValue = newBalance
                })
                if adjustGrantedBalance then
                    table.insert(stateChanges, {
                        type = "breakdown",
                        index = index,
                        field = "granted_balance",
                        delta = -toDeduct
                    })
                    table.insert(stateChanges, {
                        type = "cusFeature",
                        field = "granted_balance",
                        delta = -toDeduct
                    })
                else
                    table.insert(stateChanges, {
                        type = "breakdown",
                        index = index,
                        field = "usage",
                        delta = toDeduct
                    })
                    table.insert(stateChanges, {
                        type = "cusFeature",
                        field = "usage",
                        delta = toDeduct
                    })
                end
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "current_balance",
                    delta = -toDeduct
                })
                
                remaining = remaining - toDeduct
            end
        end
    else
        -- No breakdowns: deduct from top-level current_balance
        local topLevelCurrentBalance = cusFeature.current_balance or 0
        -- For refunds (negative amount), always apply. For deductions, only if balance > 0
        if remaining < 0 or topLevelCurrentBalance > 0 then
            -- Calculate how much we can deduct (ensure current_balance never goes below 0)
            local maxDeductible = topLevelCurrentBalance
            local toDeduct = math.min(remaining, maxDeductible)
            
            -- Collect Redis deltas
            table.insert(deltas, {key = cusFeature._key, field = "current_balance", delta = -toDeduct})
            
            -- Either increment usage or decrement granted_balance based on flag
            if adjustGrantedBalance then
                table.insert(deltas, {key = cusFeature._key, field = "granted_balance", delta = -toDeduct})
            else
                table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toDeduct})
            end
            
            -- Collect state changes
            local newBalance = topLevelCurrentBalance - toDeduct
            -- Ensure current_balance never goes below 0
            if newBalance < 0 then
                newBalance = 0
            end
            
            table.insert(stateChanges, {
                type = "cusFeature",
                field = "current_balance",
                newValue = newBalance
            })
            if adjustGrantedBalance then
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "granted_balance",
                    delta = -toDeduct
                })
            else
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "usage",
                    delta = toDeduct
                })
            end
            
            remaining = remaining - toDeduct
        end
    end
    
    return {
        remaining = remaining,
        deltas = deltas,
        stateChanges = stateChanges
    }
end

-- Deduct from overage (handles purchased_balance adjustments)
-- For positive amounts: increments purchased_balance up to max_purchase
-- For negative amounts (refunds): decrements purchased_balance down to 0
-- Only applies if overage_allowed is true
-- Parameters:
--   cusFeature: Balance object to deduct from
--   amount: Amount to handle (positive for deduction, negative for refund)
--   adjustGrantedBalance: If true, decrement granted_balance instead of incrementing usage
-- Returns: { remaining: number, deltas: [{key, field, delta}], stateChanges: [{type, index, field, newValue/delta}] }
local function deductFromOverage(cusFeature, amount, adjustGrantedBalance)
    local remaining = amount
    local deltas = {}
    local stateChanges = {}
    
    -- If adjustGrantedBalance is true, overage is not allowed
    if adjustGrantedBalance then
        return {
            remaining = remaining,
            deltas = deltas,
            stateChanges = stateChanges
        }
    end
    
    -- Early return if no amount to process
    if remaining == 0 then
        return {
            remaining = remaining,
            deltas = deltas,
            stateChanges = stateChanges
        }
    end
    
    -- Check if overage is allowed
    -- Continuous use features automatically allow overage
    local allowOverage = cusFeature.overage_allowed or (cusFeature.feature and cusFeature.feature.type == "metered" and cusFeature.feature.consumable == false)
    
    if not allowOverage then
        return {
            remaining = remaining,
            deltas = deltas,
            stateChanges = stateChanges
        }
    end
    
    -- POSITIVE AMOUNT: Increment purchased_balance up to max_purchase
    if remaining > 0 then
        -- If cusFeature has breakdowns, deduct from breakdown overage
        if cusFeature.breakdown and #cusFeature.breakdown > 0 then
        for index, breakdown in ipairs(cusFeature.breakdown) do
            if remaining <= 0 then break end
            
            -- Check if this breakdown explicitly allows overage
            -- Only deduct from breakdowns that have overage_allowed=true
            -- Don't fall back to top-level allowOverage - each breakdown controls its own overage
            local breakdownAllowOverage = breakdown.overage_allowed == true
            
            if breakdownAllowOverage then
                local breakdownPurchasedBalance = breakdown.purchased_balance or 0
                -- Calculate availableCapacity: nil if breakdown.max_purchase is nil/null (unlimited), otherwise max_purchase - purchased_balance
                local availableCapacity
                if breakdown.max_purchase == nil or breakdown.max_purchase == cjson.null then
                    -- No max_purchase limit - unlimited capacity
                    availableCapacity = nil
                else
                    -- Use breakdown max_purchase limit
                    local breakdownMaxPurchase = toNum(breakdown.max_purchase)
                    availableCapacity = breakdownMaxPurchase - breakdownPurchasedBalance
                end
                
                if availableCapacity == nil or availableCapacity > 0 then
                    local toIncrement = availableCapacity == nil and remaining or math.min(remaining, availableCapacity)
                    
                    -- Collect Redis deltas
                    table.insert(deltas, {key = breakdown._key, field = "purchased_balance", delta = toIncrement})
                    table.insert(deltas, {key = cusFeature._key, field = "purchased_balance", delta = toIncrement})
                    
                    -- Either increment usage or decrement granted_balance based on flag
                    if adjustGrantedBalance then
                        table.insert(deltas, {key = breakdown._key, field = "granted_balance", delta = -toIncrement})
                        table.insert(deltas, {key = cusFeature._key, field = "granted_balance", delta = -toIncrement})
                    else
                        table.insert(deltas, {key = breakdown._key, field = "usage", delta = toIncrement})
                        table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toIncrement})
                    end
                    
                    -- Collect state changes
                    table.insert(stateChanges, {
                        type = "breakdown",
                        index = index,
                        field = "purchased_balance",
                        delta = toIncrement
                    })
                    if adjustGrantedBalance then
                        table.insert(stateChanges, {
                            type = "breakdown",
                            index = index,
                            field = "granted_balance",
                            delta = -toIncrement
                        })
                        table.insert(stateChanges, {
                            type = "cusFeature",
                            field = "granted_balance",
                            delta = -toIncrement
                        })
                    else
                        table.insert(stateChanges, {
                            type = "breakdown",
                            index = index,
                            field = "usage",
                            delta = toIncrement
                        })
                        table.insert(stateChanges, {
                            type = "cusFeature",
                            field = "usage",
                            delta = toIncrement
                        })
                    end
                    table.insert(stateChanges, {
                        type = "cusFeature",
                        field = "purchased_balance",
                        delta = toIncrement
                    })
                    
                    remaining = remaining - toIncrement
                end
            end
        end
    else
        -- No breakdowns: deduct from top-level overage
        local topLevelPurchasedBalance = cusFeature.purchased_balance or 0
        -- Calculate availableCapacity: nil if max_purchase is nil/null (unlimited), otherwise max_purchase - purchased_balance
        local availableCapacity
        if cusFeature.max_purchase == nil or cusFeature.max_purchase == cjson.null then
            -- No max_purchase limit - unlimited capacity
            availableCapacity = nil
        else
            -- Use max_purchase limit
            local topLevelMaxPurchase = toNum(cusFeature.max_purchase)
            availableCapacity = topLevelMaxPurchase - topLevelPurchasedBalance
        end
        
        if availableCapacity == nil or availableCapacity > 0 then
            local toIncrement = availableCapacity == nil and remaining or math.min(remaining, availableCapacity)
            
            -- Collect Redis deltas
            table.insert(deltas, {key = cusFeature._key, field = "purchased_balance", delta = toIncrement})
            
            -- Either increment usage or decrement granted_balance based on flag
            if adjustGrantedBalance then
                table.insert(deltas, {key = cusFeature._key, field = "granted_balance", delta = -toIncrement})
            else
                table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toIncrement})
            end
            
            -- Collect state changes
            table.insert(stateChanges, {
                type = "cusFeature",
                field = "purchased_balance",
                delta = toIncrement
            })
            if adjustGrantedBalance then
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "granted_balance",
                    delta = -toIncrement
                })
            else
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "usage",
                    delta = toIncrement
                })
            end
            
            remaining = remaining - toIncrement
        end
        end
    -- NEGATIVE AMOUNT (REFUND): Decrement purchased_balance down to 0
    else
        -- If cusFeature has breakdowns, refund from breakdown overage
        if cusFeature.breakdown and #cusFeature.breakdown > 0 then
            for index, breakdown in ipairs(cusFeature.breakdown) do
                if remaining >= 0 then break end
                
                local breakdownAllowOverage = breakdown.overage_allowed == true
                if breakdownAllowOverage then
                    local breakdownPurchasedBalance = breakdown.purchased_balance or 0
                    local toDecrement = math.min(-remaining, breakdownPurchasedBalance)
                    
                    if toDecrement > 0 then
                        table.insert(deltas, {key = breakdown._key, field = "purchased_balance", delta = -toDecrement})
                        table.insert(deltas, {key = cusFeature._key, field = "purchased_balance", delta = -toDecrement})
                        table.insert(deltas, {key = breakdown._key, field = "usage", delta = -toDecrement})
                        table.insert(deltas, {key = cusFeature._key, field = "usage", delta = -toDecrement})
                        
                        table.insert(stateChanges, {type = "breakdown", index = index, field = "purchased_balance", delta = -toDecrement})
                        table.insert(stateChanges, {type = "breakdown", index = index, field = "usage", delta = -toDecrement})
                        table.insert(stateChanges, {type = "cusFeature", field = "purchased_balance", delta = -toDecrement})
                        table.insert(stateChanges, {type = "cusFeature", field = "usage", delta = -toDecrement})
                        
                        remaining = remaining + toDecrement
                    end
                end
            end
        else
            -- No breakdowns: refund from top-level overage
            local topLevelPurchasedBalance = cusFeature.purchased_balance or 0
            local toDecrement = math.min(-remaining, topLevelPurchasedBalance)
            
            if toDecrement > 0 then
                table.insert(deltas, {key = cusFeature._key, field = "purchased_balance", delta = -toDecrement})
                table.insert(deltas, {key = cusFeature._key, field = "usage", delta = -toDecrement})
                
                table.insert(stateChanges, {type = "cusFeature", field = "purchased_balance", delta = -toDecrement})
                table.insert(stateChanges, {type = "cusFeature", field = "usage", delta = -toDecrement})
                
                remaining = remaining + toDecrement
            end
        end
    end
    
    return {
        remaining = remaining,
        deltas = deltas,
        stateChanges = stateChanges
    }
end

-- Deduct from main balance (handles both breakdown and non-breakdown scenarios)
-- Handles both positive (deduct) and negative (refund) amounts
-- For positive amounts: deducts from current_balance, then overage
-- For negative amounts: refunds from overage (purchased_balance), then current_balance
-- Parameters:
--   cusFeature: Balance object to deduct from
--   amount: Amount to deduct (can be negative for refunds)
--   adjustGrantedBalance: If true, decrement granted_balance instead of incrementing usage
-- Returns: { remaining: number, deltas: [{key, field, delta}], stateChanges: [{type, index, field, newValue/delta}] }
local function deductFromMainBalance(cusFeature, amount, adjustGrantedBalance)
    local allDeltas = {}
    local allStateChanges = {}
    local remaining = amount
    
    -- POSITIVE AMOUNT (DEDUCTION): current_balance → overage
    local isPaidAllocated = cusFeature.feature and cusFeature.feature.type == "metered" and cusFeature.feature.consumable == false and cusFeature.overage_allowed == true
    
    if remaining > 0 or isPaidAllocated then
        -- Pass 1: Deduct from current_balance
        local currentBalanceResult = deductFromCurrentBalance(cusFeature, remaining, adjustGrantedBalance)
        remaining = currentBalanceResult.remaining
        
        for _, delta in ipairs(currentBalanceResult.deltas) do
            table.insert(allDeltas, delta)
        end
        for _, stateChange in ipairs(currentBalanceResult.stateChanges) do
            table.insert(allStateChanges, stateChange)
        end
        
        -- Pass 2: Deduct from overage (increments purchased_balance up to max_purchase)
        if remaining > 0 then
            local overageResult = deductFromOverage(cusFeature, remaining, adjustGrantedBalance)
            remaining = overageResult.remaining
            
            for _, delta in ipairs(overageResult.deltas) do
                table.insert(allDeltas, delta)
            end
            for _, stateChange in ipairs(overageResult.stateChanges) do
                table.insert(allStateChanges, stateChange)
            end
        end
    -- NEGATIVE AMOUNT (REFUND): overage → current_balance
    else
        -- Pass 1: Refund from overage (decrements purchased_balance down to 0)
        local overageResult = deductFromOverage(cusFeature, remaining, adjustGrantedBalance)
        remaining = overageResult.remaining
        
        for _, delta in ipairs(overageResult.deltas) do
            table.insert(allDeltas, delta)
        end
        for _, stateChange in ipairs(overageResult.stateChanges) do
            table.insert(allStateChanges, stateChange)
        end
        
        -- Pass 2: Refund to current_balance (increments current_balance)
        if remaining < 0 then
            local currentBalanceResult = deductFromCurrentBalance(cusFeature, remaining, adjustGrantedBalance)
            remaining = currentBalanceResult.remaining
            
            for _, delta in ipairs(currentBalanceResult.deltas) do
                table.insert(allDeltas, delta)
            end
            for _, stateChange in ipairs(currentBalanceResult.stateChanges) do
                table.insert(allStateChanges, stateChange)
            end
        end
    end
    
    return {
        remaining = remaining,
        deltas = allDeltas,
        stateChanges = allStateChanges
    }
end



-- ============================================================================
-- DEDUCTION COORDINATION FUNCTIONS
-- ============================================================================

-- Deduct from a single customer feature (handles rollovers + main balance)
-- Returns: { remaining: number, deltas: array, stateChanges: array }
local function deductFromCusFeature(cusFeature, amount)
    local allDeltas = {}
    local allStateChanges = {}
    
    -- Step 1: Deduct from rollovers first
    local rolloverResult = deductFromRollovers(cusFeature, amount, adjustGrantedBalance)
    local remaining = rolloverResult.remaining
    
    -- Collect rollover deltas and state changes
    for _, delta in ipairs(rolloverResult.deltas) do
        table.insert(allDeltas, delta)
    end
    for _, stateChange in ipairs(rolloverResult.stateChanges) do
        table.insert(allStateChanges, stateChange)
    end
    
    -- Step 2: Deduct remaining from main balance
    if remaining ~= 0 then
        local mainResult = deductFromMainBalance(cusFeature, remaining, adjustGrantedBalance)
        remaining = mainResult.remaining
        
        -- Collect main balance deltas and state changes
        for _, delta in ipairs(mainResult.deltas) do
            table.insert(allDeltas, delta)
        end
        for _, stateChange in ipairs(mainResult.stateChanges) do
            table.insert(allStateChanges, stateChange)
        end
    end
    
    return {
        remaining = remaining,
        deltas = allDeltas,
        stateChanges = allStateChanges
    }
end


-- Deduct from customer feature AND entity features
-- If targetEntityId is provided, only deduct from that entity (entity-level tracking)
-- If targetEntityId is nil, deduct from ALL entities (customer-level tracking)
-- Returns: { remaining: number, deltas: array, customerStateChanges: array, entityStateChanges: { [entityId] = array } }
local function deductFromFeatureWithEntities(customerFeature, entityFeaturesMap, amount, targetEntityId)
    local allDeltas = {}
    local customerStateChanges = {}
    local entityStateChanges = {}
    
    local remaining = amount
    
    if targetEntityId then
        -- Entity-level tracking: deduct from entity FIRST, then customer
        
        -- Step 1: Deduct from entity rollovers
        local entityFeatures = entityFeaturesMap[targetEntityId]
        if entityFeatures then
            local entityFeature = entityFeatures[customerFeature.id]
            if entityFeature and remaining > 0 then
                local entityRolloverResult = deductFromRollovers(entityFeature, remaining, adjustGrantedBalance)
                remaining = entityRolloverResult.remaining
                for _, delta in ipairs(entityRolloverResult.deltas) do
                    table.insert(allDeltas, delta)
                end
                if not entityStateChanges[targetEntityId] then
                    entityStateChanges[targetEntityId] = {}
                end
                for _, change in ipairs(entityRolloverResult.stateChanges) do
                    table.insert(entityStateChanges[targetEntityId], change)
                end
            end
        end
        
        -- Step 2: Deduct from entity main balance
        if entityFeatures then
            local entityFeature = entityFeatures[customerFeature.id]
            if entityFeature and remaining ~= 0 then
                local entityMainResult = deductFromMainBalance(entityFeature, remaining, adjustGrantedBalance)
                remaining = entityMainResult.remaining
                for _, delta in ipairs(entityMainResult.deltas) do
                    table.insert(allDeltas, delta)
                end
                if not entityStateChanges[targetEntityId] then
                    entityStateChanges[targetEntityId] = {}
                end
                for _, change in ipairs(entityMainResult.stateChanges) do
                    table.insert(entityStateChanges[targetEntityId], change)
                end
            end
        end
        
        -- Step 3: Deduct from customer rollovers
        if remaining > 0 then
            local customerRolloverResult = deductFromRollovers(customerFeature, remaining, adjustGrantedBalance)
            remaining = customerRolloverResult.remaining
            for _, delta in ipairs(customerRolloverResult.deltas) do
                table.insert(allDeltas, delta)
            end
            for _, change in ipairs(customerRolloverResult.stateChanges) do
                table.insert(customerStateChanges, change)
            end
        end
        
        -- Step 4: Deduct from customer main balance
        if remaining ~= 0 then
            local customerMainResult = deductFromMainBalance(customerFeature, remaining, adjustGrantedBalance)
            remaining = customerMainResult.remaining
            for _, delta in ipairs(customerMainResult.deltas) do
                table.insert(allDeltas, delta)
            end
            for _, change in ipairs(customerMainResult.stateChanges) do
                table.insert(customerStateChanges, change)
            end
        end
    else
        -- Customer-level tracking: deduct from customer FIRST, then all entities
        
        -- Step 1: Deduct from customer rollovers
        local customerRolloverResult = deductFromRollovers(customerFeature, remaining, adjustGrantedBalance)
        remaining = customerRolloverResult.remaining
        for _, delta in ipairs(customerRolloverResult.deltas) do
            table.insert(allDeltas, delta)
        end
        for _, change in ipairs(customerRolloverResult.stateChanges) do
            table.insert(customerStateChanges, change)
        end
        
        -- Step 2: Deduct from customer main balance
        if remaining ~= 0 then
            local customerMainResult = deductFromMainBalance(customerFeature, remaining, adjustGrantedBalance)
            remaining = customerMainResult.remaining
            for _, delta in ipairs(customerMainResult.deltas) do
                table.insert(allDeltas, delta)
            end
            for _, change in ipairs(customerMainResult.stateChanges) do
                table.insert(customerStateChanges, change)
            end
        end
        
        -- Step 3: Deduct from all entity rollovers (sorted for consistency)
        if remaining > 0 then
            local sortedEntityIds = {}
            for entityId in pairs(entityFeaturesMap) do
                table.insert(sortedEntityIds, entityId)
            end
            table.sort(sortedEntityIds)
            
            for _, entityId in ipairs(sortedEntityIds) do
                local entityFeatures = entityFeaturesMap[entityId]
                local entityFeature = entityFeatures[customerFeature.id]
                if entityFeature and remaining > 0 then
                    local entityRolloverResult = deductFromRollovers(entityFeature, remaining, adjustGrantedBalance)
                    remaining = entityRolloverResult.remaining
                    for _, delta in ipairs(entityRolloverResult.deltas) do
                        table.insert(allDeltas, delta)
                    end
                    if not entityStateChanges[entityId] then
                        entityStateChanges[entityId] = {}
                    end
                    for _, change in ipairs(entityRolloverResult.stateChanges) do
                        table.insert(entityStateChanges[entityId], change)
                    end
                end
            end
        end
        
        -- Step 4: Deduct from all entity main balances (sorted for consistency)
        if remaining ~= 0 then
            local sortedEntityIds = {}
            for entityId in pairs(entityFeaturesMap) do
                table.insert(sortedEntityIds, entityId)
            end
            table.sort(sortedEntityIds)
            
            for _, entityId in ipairs(sortedEntityIds) do
                local entityFeatures = entityFeaturesMap[entityId]
                local entityFeature = entityFeatures[customerFeature.id]
                if entityFeature and remaining ~= 0 then
                    local entityMainResult = deductFromMainBalance(entityFeature, remaining, adjustGrantedBalance)
                    remaining = entityMainResult.remaining
                    for _, delta in ipairs(entityMainResult.deltas) do
                        table.insert(allDeltas, delta)
                    end
                    if not entityStateChanges[entityId] then
                        entityStateChanges[entityId] = {}
                    end
                    for _, change in ipairs(entityMainResult.stateChanges) do
                        table.insert(entityStateChanges[entityId], change)
                    end
                end
            end
        end
    end
    
    return {
        remaining = remaining,
        deltas = allDeltas,
        customerStateChanges = customerStateChanges,
        entityStateChanges = entityStateChanges
    }
end

-- ============================================================================
-- REQUEST PROCESSING
-- ============================================================================

-- Helper: Calculate sync deltas for sync mode requests
-- In sync mode, we want to adjust cache to match the target balance from Postgres
-- If entityId is provided, loads entity-level balances (entity + customer)
-- If entityId is nil, loads customer-level balances (customer + all entities)
local function calculateSyncDeltas(featureDeductions, targetBalance, entityId)
    -- Load merged balances based on perspective (entity-level or customer-level)
    local mergedFeatures = loadBalances(cacheKey, orgId, env, customerId, entityId)
    
    if not mergedFeatures then
        return -- Customer/entity not in cache, no-op
    end
    
    for _, featureDeduction in ipairs(featureDeductions) do
        local featureId = featureDeduction.featureId
        local mergedFeature = mergedFeatures[featureId]
        
        if mergedFeature and not mergedFeature.unlimited then
            -- Get current MERGED balance (from entity-level or customer-level perspective)
            local currentBalance = mergedFeature.current_balance or 0
            
            -- Calculate delta (positive means deduct, negative means refund)
            -- Example: currentBalance=10, targetBalance=7 → delta=3 (need to deduct 3)
            -- Example: currentBalance=5, targetBalance=7 → delta=-2 (need to refund 2)
            local delta = currentBalance - targetBalance
            
            -- Override the amount with the calculated delta
            featureDeduction.amount = delta
        end
    end
end

-- Helper: Apply state changes to a cusFeature object
local function applyStateChanges(cusFeature, stateChanges)
    for _, change in ipairs(stateChanges) do
        if change.type == "cusFeature" then
            if change.newValue then
                cusFeature[change.field] = change.newValue
            elseif change.delta then
                cusFeature[change.field] = (cusFeature[change.field] or 0) + change.delta
            end
        elseif change.type == "breakdown" then
            local breakdown = cusFeature.breakdown[change.index]
            if breakdown then
                if change.newValue then
                    breakdown[change.field] = change.newValue
                elseif change.delta then
                    breakdown[change.field] = (breakdown[change.field] or 0) + change.delta
                end
            end
        elseif change.type == "rollover" then
            local rollover = cusFeature.rollovers[change.index]
            if rollover then
                if change.newValue then
                    rollover[change.field] = change.newValue
                elseif change.delta then
                    rollover[change.field] = (rollover[change.field] or 0) + change.delta
                end
            end
        end
    end
end

-- Process a single request (one unit with multiple cusFeature deductions)
-- Returns: { success: boolean, error?: string }
local function processRequest(request, loadedCusFeatures, entityFeatureStates)
    local featureDeductions = request.featureDeductions
    local overageBehavior = request.overageBehavior or "cap"
    local entityId = request.entityId -- nil for customer-level tracking, set for entity-level tracking
    local syncMode = request.syncMode or false
    local targetBalance = request.targetBalance
    
    -- Collect all deltas and state changes for this request
    local requestDeltas = {}
    local requestStateChanges = {}
    
    -- SYNC MODE: Calculate delta to bring cache to target balance
    -- Note: syncMode requests should only have ONE feature deduction
    if syncMode and targetBalance then
        calculateSyncDeltas(featureDeductions, targetBalance, entityId)
    end
    
    -- Try to deduct from all features (primary + credit systems)
    for _, featureDeduction in ipairs(featureDeductions) do
        local featureId = featureDeduction.featureId
        local amount = featureDeduction.amount
        local cusFeature = loadedCusFeatures[featureId]
        
        -- Step 1: Try to deduct from primary cusFeature first
        local remainingAmount = amount
        
        if cusFeature then
            -- Customer has this feature - deduct from customer + entities
            if not cusFeature.unlimited then
                local result = deductFromFeatureWithEntities(cusFeature, entityFeatureStates, amount, entityId)
                
                -- Collect deltas
                for _, delta in ipairs(result.deltas) do
                    table.insert(requestDeltas, delta)
                end
                
                -- Collect customer state changes
                table.insert(requestStateChanges, {
                    target = "customer",
                    cusFeature = cusFeature,
                    changes = result.customerStateChanges
                })
                
                -- Collect entity state changes
                for entityIdKey, changes in pairs(result.entityStateChanges) do
                    table.insert(requestStateChanges, {
                        target = "entity",
                        entityId = entityIdKey,
                        cusFeature = entityFeatureStates[entityIdKey][cusFeature.id],
                        changes = changes
                    })
                end
                
                -- Update remaining amount
                remainingAmount = result.remaining
            else
                -- Unlimited feature covers everything
                remainingAmount = 0
            end
        else
            -- Entity-only feature - customer doesn't have it, only entities do
            -- Deduct directly from entity/entities
            if entityId then
                -- Entity-level tracking: deduct from specific entity only
                local entityFeatures = entityFeatureStates[entityId]
                if entityFeatures and entityFeatures[featureId] then
                    local entityFeature = entityFeatures[featureId]
                    if not entityFeature.unlimited then
                        local result = deductFromCusFeature(entityFeature, amount)
                        
                        -- Collect deltas
                        for _, delta in ipairs(result.deltas) do
                            table.insert(requestDeltas, delta)
                        end
                        
                        -- Collect entity state changes
                        table.insert(requestStateChanges, {
                            target = "entity",
                            entityId = entityId,
                            cusFeature = entityFeature,
                            changes = result.stateChanges
                        })
                        
                        remainingAmount = result.remaining
                    else
                        remainingAmount = 0
                    end
                end
            else
                -- Customer-level tracking: deduct from ALL entities (sorted for consistency)
                local sortedEntityIds = {}
                for entId in pairs(entityFeatureStates) do
                    table.insert(sortedEntityIds, entId)
                end
                table.sort(sortedEntityIds)
                
                local totalDeducted = 0
                for _, entId in ipairs(sortedEntityIds) do
                    local entityFeatures = entityFeatureStates[entId]
                    local entityFeature = entityFeatures[featureId]
                    if entityFeature and remainingAmount ~= 0 then
                        if not entityFeature.unlimited then
                            local result = deductFromCusFeature(entityFeature, remainingAmount)
                            
                            -- Collect deltas
                            for _, delta in ipairs(result.deltas) do
                                table.insert(requestDeltas, delta)
                            end
                            
                            -- Collect entity state changes
                            table.insert(requestStateChanges, {
                                target = "entity",
                                entityId = entId,
                                cusFeature = entityFeature,
                                changes = result.stateChanges
                            })
                            
                            totalDeducted = totalDeducted + (amount - result.remaining)
                            remainingAmount = result.remaining
                        else
                            remainingAmount = 0
                            break
                        end
                    end
                end
            end
        end
        
        -- Step 2: If there's remaining amount, try credit systems
        if remainingAmount ~= 0 then
            -- Find credit system cusFeatures that reference this feature
            for _, otherCusFeature in pairs(loadedCusFeatures) do
                -- Check if this balance has a feature with credit_schema
                if otherCusFeature.feature and otherCusFeature.feature.credit_schema then
                    -- Check if this credit system references our feature
                    for _, creditItem in ipairs(otherCusFeature.feature.credit_schema) do
                        if creditItem.metered_feature_id == featureId then
                            -- Calculate credit amount needed for remaining
                            local creditAmount = remainingAmount * creditItem.credit_cost
                            
                            if not otherCusFeature.unlimited then
                                local result = deductFromFeatureWithEntities(otherCusFeature, entityFeatureStates, creditAmount, entityId)
                                
                                -- Collect deltas
                                for _, delta in ipairs(result.deltas) do
                                    table.insert(requestDeltas, delta)
                                end
                                
                                -- Collect customer state changes
                                table.insert(requestStateChanges, {
                                    target = "customer",
                                    cusFeature = otherCusFeature,
                                    changes = result.customerStateChanges
                                })
                                
                                -- Collect entity state changes
                                for entityId, changes in pairs(result.entityStateChanges) do
                                    table.insert(requestStateChanges, {
                                        target = "entity",
                                        entityId = entityId,
                                        cusFeature = entityFeatureStates[entityId][otherCusFeature.id],
                                        changes = changes
                                    })
                                end
                                
                                -- Update remaining based on what credit system could cover
                                -- If credit system couldn't cover all, calculate how much of original remains
                                if result.remaining ~= 0 then
                                    local creditCovered = creditAmount - result.remaining
                                    local originalCovered = creditCovered / creditItem.credit_cost
                                    remainingAmount = remainingAmount - originalCovered
                                else
                                    -- Credit system covered everything
                                    remainingAmount = 0
                                end
                            else
                                -- Unlimited credit system covers everything
                                remainingAmount = 0
                            end
                            break
                        end
                    end
                end
                
                -- Stop if we've covered everything
                if remainingAmount == 0 then
                    break
                end
            end
        end
        
        -- Step 3: Check if request can succeed based on overage behavior
        if remainingAmount ~= 0 and overageBehavior == "reject" then
            return {
                success = false,
                error = "INSUFFICIENT_BALANCE"
            }
        end
    end
    
    -- Request succeeded - merge deltas into global and apply state changes
    for _, delta in ipairs(requestDeltas) do
        addDelta(delta.key, delta.field, delta.delta)
    end
    
    for _, stateChange in ipairs(requestStateChanges) do
        applyStateChanges(stateChange.cusFeature, stateChange.changes)
        
        -- Track which scopes were modified (customer vs entity)
        if stateChange.target == "customer" then
            customerChanged = true
            -- Track which customer feature was changed
            if stateChange.cusFeature and stateChange.cusFeature.id then
                changedCustomerFeatureIds[stateChange.cusFeature.id] = true
            end
        elseif stateChange.target == "entity" and stateChange.entityId then
            changedEntityIds[stateChange.entityId] = true
            -- Track which entity feature was changed
            if stateChange.cusFeature and stateChange.cusFeature.id then
                if not changedEntityFeatureIds[stateChange.entityId] then
                    changedEntityFeatureIds[stateChange.entityId] = {}
                end
                changedEntityFeatureIds[stateChange.entityId][stateChange.cusFeature.id] = true
            end
        end
    end
    
    return {
        success = true,
        error = nil
    }
end

-- ============================================================================
-- MAIN EXECUTION
-- ============================================================================

-- Collect all unique feature IDs from all requests
local requestedFeatureIds = {}
for _, request in ipairs(requests) do
    for _, featureDeduction in ipairs(request.featureDeductions) do
        requestedFeatureIds[featureDeduction.featureId] = true
    end
end

-- -- Helper function to apply legacy continuous_use logic
-- -- Legacy case: continuous_use features always allow overage
-- local function applyContinuousUseLegacy(balance)
--     if balance.feature and balance.feature.type == "metered" and balance.feature.consumable == false and remaining > 0 then
--         balance.overage_allowed = true
--         -- Apply to breakdowns as well
--         if balance.breakdown then
--             for _, breakdown in ipairs(balance.breakdown) do
--                 breakdown.overage_allowed = true
--             end
--         end
--     end
-- end

-- Get list of all customer feature IDs
local baseJson = redis.call("GET", cacheKey)
local allFeatureIds = {}
if baseJson then
    local baseCustomer = cjson.decode(baseJson)
    allFeatureIds = baseCustomer._balanceFeatureIds or {}
end

-- Load all customer balances (so we can find credit systems)
local loadedCusFeatures = {}
for _, featureId in ipairs(allFeatureIds) do
    local balance = loadBalance(cacheKey, featureId)
    if balance then
        -- Add id field for compatibility with existing code
        balance.id = featureId
        
        -- -- Apply legacy continuous_use logic
        -- applyContinuousUseLegacy(balance)
        
        loadedCusFeatures[featureId] = balance
    end
end

-- Get entity IDs from customer
local baseCustomer = cjson.decode(baseJson)
local entityIds = baseCustomer._entityIds or {}

-- Load all entity features: { [entityId] = { [featureId] = entityFeature } }
local entityFeatureStates = {}
for _, entityId in ipairs(entityIds) do
    local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
    local entityBaseJson = redis.call("GET", entityCacheKey)
    
    if entityBaseJson then
        local entityBase = cjson.decode(entityBaseJson)
        local entityFeatureIds = entityBase._balanceFeatureIds or {}
        entityFeatureStates[entityId] = {}
        
        for _, featureId in ipairs(entityFeatureIds) do
            -- Load entity balance using shared utility function
            local balance = loadBalance(entityCacheKey, featureId)
            if balance then
                -- Add id field for compatibility with existing code
                balance.id = featureId
                
                -- -- Apply legacy continuous_use logic
                -- applyContinuousUseLegacy(balance)
                
                entityFeatureStates[entityId][featureId] = balance
            end
        end
    end
end

-- Process all requests
local results = {}
for i, request in ipairs(requests) do
    local result = processRequest(request, loadedCusFeatures, entityFeatureStates)
    table.insert(results, result)
end

-- Apply all accumulated deltas (ONE Redis write per key per field)
for key, deltas in pairs(keyDeltas) do
    for field, delta in pairs(deltas) do
        if delta ~= 0 then
            redis.call("HINCRBYFLOAT", key, field, delta)
        end
        
    end
end

-- Convert changedEntityIds set to array
local changedEntityIdsArray = {}
for entityId, _ in pairs(changedEntityIds) do
    table.insert(changedEntityIdsArray, entityId)
end

-- Calculate actual deductions per feature from keyDeltas
-- Sum up usage deltas (or granted_balance deltas if adjustGrantedBalance is true)
local featureDeductions = {}
for key, deltas in pairs(keyDeltas) do
    -- Extract featureId from key (format: "{orgId}:env:customer:{version}:customerId:balances:featureId" or with ":entity:entityId:balances:featureId")
    local featureId = key:match(":balances:([^:]+)$")
    if featureId then
        local deductionAmount = 0
        if adjustGrantedBalance then
            -- When adjustGrantedBalance is true, we decrement granted_balance (negative delta = deduction)
            deductionAmount = -(deltas.granted_balance or 0)
        else
            -- Normal case: increment usage (positive delta = deduction)
            deductionAmount = deltas.usage or 0
        end
        
        if deductionAmount ~= 0 then
            featureDeductions[featureId] = (featureDeductions[featureId] or 0) + deductionAmount
        end
    end
end

-- ============================================================================
-- LOAD CHANGED BALANCES AFTER DEDUCTIONS (MERGED VERSIONS)
-- ============================================================================

-- Collect all changed balances (customer + entities) as object keyed by featureId
local changedBalances = {}

-- Load merged customer balances if customer was changed
if customerChanged then
    local customerObject = getCustomerObject(orgId, env, customerId, false)
    if customerObject and customerObject.balances then
        -- Extract only the changed customer balances
        for featureId, _ in pairs(changedCustomerFeatureIds) do
            local balance = customerObject.balances[featureId]
            if balance then
                changedBalances[featureId] = balance
            end
        end
    end
end

-- Load merged entity balances for each changed entity
for entityId, featureIds in pairs(changedEntityFeatureIds) do
    local entityObject = getEntityObject(orgId, env, customerId, entityId, false)
    if entityObject and entityObject.balances then
        -- Extract only the changed entity balances
        for featureId, _ in pairs(featureIds) do
            local balance = entityObject.balances[featureId]
            if balance then
                changedBalances[featureId] = balance
            end
        end
    end
end

-- Return results with changed scopes and changed balances
return cjson.encode({
    success = true,
    results = results,
    customerChanged = customerChanged,
    changedEntityIds = changedEntityIdsArray,
    balances = changedBalances,
    featureDeductions = featureDeductions
})


