-- batchDeduction.lua
-- Atomically processes a batch of track requests for a customer
-- Each request can deduct from multiple features
--
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
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

local cacheKey = KEYS[1]
local requestsJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]

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

-- Helper: Load a customer feature from Redis
local function loadCusFeature(featureId)
    local featureKey = cacheKey .. ":features:" .. featureId
    local featureHash = redis.call("HGETALL", featureKey)
    
    if #featureHash == 0 then
        return nil
    end
    
    -- Parse customer feature fields
    local cusFeature = { id = featureId, _key = featureKey }
    for i = 1, #featureHash, 2 do
        local key = featureHash[i]
        local value = featureHash[i + 1]
        
        if key == "balance" or key == "usage" or key == "usage_limit" or key == "included_usage" or key == "_breakdown_count" or key == "_rollover_count" then
            cusFeature[key] = tonumber(value)
        elseif key == "unlimited" or key == "overage_allowed" then
            cusFeature[key] = (value == "true")
        elseif key == "type" then
            cusFeature[key] = value
        elseif key == "credit_schema" then
            if value ~= "null" and value ~= "" then
                cusFeature[key] = cjson.decode(value)
            else
                cusFeature[key] = nil
            end
        elseif value == "null" then
            cusFeature[key] = nil
        else
            cusFeature[key] = value
        end
    end
    
    -- Load breakdowns if they exist
    local breakdownCount = cusFeature._breakdown_count or 0
    cusFeature.breakdowns = {}
    for i = 0, breakdownCount - 1 do
        local breakdownKey = cacheKey .. ":features:" .. featureId .. ":breakdown:" .. i
        local breakdownHash = redis.call("HGETALL", breakdownKey)
        
        if #breakdownHash > 0 then
            local breakdown = { _index = i, _key = breakdownKey }
            for j = 1, #breakdownHash, 2 do
                local key = breakdownHash[j]
                local value = breakdownHash[j + 1]
                
                if key == "balance" or key == "usage" or key == "usage_limit" then
                    breakdown[key] = tonumber(value)
                elseif key == "overage_allowed" then
                    breakdown[key] = (value == "true")
                else
                    breakdown[key] = value
                end
            end
            table.insert(cusFeature.breakdowns, breakdown)
        end
    end
    
    -- Load rollovers if they exist
    local rolloverCount = cusFeature._rollover_count or 0
    cusFeature.rollovers = {}
    for i = 0, rolloverCount - 1 do
        local rolloverKey = cacheKey .. ":features:" .. featureId .. ":rollover:" .. i
        local rolloverHash = redis.call("HGETALL", rolloverKey)
        
        if #rolloverHash > 0 then
            local rollover = { _index = i, _key = rolloverKey }
            for j = 1, #rolloverHash, 2 do
                local key = rolloverHash[j]
                local value = rolloverHash[j + 1]
                
                if key == "balance" or key == "expires_at" then
                    rollover[key] = tonumber(value)
                else
                    rollover[key] = value
                end
            end
            table.insert(cusFeature.rollovers, rollover)
        end
    end
    
    return cusFeature
end

-- ============================================================================
-- VALIDATION
-- ============================================================================

-- No validation function needed - we try deduction and check remaining

-- ============================================================================
-- CORE DEDUCTION LOGIC
-- ============================================================================

-- Deduct from rollover balances - returns deltas without modifying cusFeature
-- Returns: { remaining: number, deltas: [{key, field, delta}], stateChanges: [{type, index, field, newValue}] }
local function deductFromRollovers(cusFeature, amount)
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
            table.insert(deltas, {key = cusFeature._key, field = "balance", delta = -toDeduct})
            table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toDeduct})
            
            -- Collect state changes
            table.insert(stateChanges, {
                type = "rollover",
                index = index,
                field = "balance",
                newValue = rolloverBalance - toDeduct
            })
            table.insert(stateChanges, {
                type = "cusFeature",
                field = "balance",
                delta = -toDeduct
            })
            table.insert(stateChanges, {
                type = "cusFeature",
                field = "usage",
                delta = toDeduct
            })
            
            remaining = remaining - toDeduct
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
-- Returns: { remaining: number, deltas: [{key, field, delta}], stateChanges: [{type, index, field, newValue/delta}] }
local function deductFromMainBalance(cusFeature, amount)
    local remaining = amount
    local deltas = {}
    local stateChanges = {}
    
    -- If cusFeature has breakdowns, deduct from breakdowns
    if #cusFeature.breakdowns > 0 then
        -- Pass 1: Deduct from breakdown balances (or refund to breakdown)
        for index, breakdown in ipairs(cusFeature.breakdowns) do
            if remaining == 0 then break end
            
            local breakdownBalance = breakdown.balance or 0
            -- For refunds (negative amount), always apply. For deductions, only if balance > 0
            if remaining < 0 or breakdownBalance > 0 then
                local toDeduct = math.min(remaining, breakdownBalance)
                
                -- Collect Redis deltas
                table.insert(deltas, {key = breakdown._key, field = "balance", delta = -toDeduct})
                table.insert(deltas, {key = breakdown._key, field = "usage", delta = toDeduct})
                table.insert(deltas, {key = cusFeature._key, field = "balance", delta = -toDeduct})
                table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toDeduct})
                
                -- Collect state changes
                table.insert(stateChanges, {
                    type = "breakdown",
                    index = index,
                    field = "balance",
                    newValue = breakdownBalance - toDeduct
                })
                table.insert(stateChanges, {
                    type = "breakdown",
                    index = index,
                    field = "usage",
                    delta = toDeduct
                })
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "balance",
                    delta = -toDeduct
                })
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "usage",
                    delta = toDeduct
                })
                
                remaining = remaining - toDeduct
            end
        end
        
        -- Pass 2: Deduct from breakdown overage (if allowed)
        if remaining > 0 then
            for index, breakdown in ipairs(cusFeature.breakdowns) do
                if remaining == 0 then break end
                
                -- Continuous use features automatically allow overage
                local allowOverage = breakdown.overage_allowed or cusFeature.type == "continuous_use"
                
                if allowOverage then
                    local currentUsage = breakdown.usage or 0
                    local toDeduct = remaining
                    
                    -- If usage_limit is defined, cap the overage
                    if breakdown.usage_limit then
                        local availableOverage = breakdown.usage_limit - currentUsage
                        if availableOverage > 0 then
                            toDeduct = math.min(remaining, availableOverage)
                        else
                            toDeduct = 0
                        end
                    end
                    
                    if toDeduct > 0 then
                        -- Collect Redis deltas
                        table.insert(deltas, {key = breakdown._key, field = "balance", delta = -toDeduct})
                        table.insert(deltas, {key = breakdown._key, field = "usage", delta = toDeduct})
                        table.insert(deltas, {key = cusFeature._key, field = "balance", delta = -toDeduct})
                        table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toDeduct})
                        
                        -- Collect state changes
                        table.insert(stateChanges, {
                            type = "breakdown",
                            index = index,
                            field = "balance",
                            delta = -toDeduct
                        })
                        table.insert(stateChanges, {
                            type = "breakdown",
                            index = index,
                            field = "usage",
                            delta = toDeduct
                        })
                        table.insert(stateChanges, {
                            type = "cusFeature",
                            field = "balance",
                            delta = -toDeduct
                        })
                        table.insert(stateChanges, {
                            type = "cusFeature",
                            field = "usage",
                            delta = toDeduct
                        })
                        
                        remaining = remaining - toDeduct
                    end
                end
            end
        end
    else
        -- No breakdowns: deduct from top-level balance (or refund to top-level)
        local topLevelBalance = cusFeature.balance or 0
        -- For refunds (negative amount), always apply. For deductions, only if balance > 0
        if remaining < 0 or topLevelBalance > 0 then
            local toDeduct = math.min(remaining, topLevelBalance)
            
            -- Collect Redis deltas
            table.insert(deltas, {key = cusFeature._key, field = "balance", delta = -toDeduct})
            table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toDeduct})
            
            -- Collect state changes
            table.insert(stateChanges, {
                type = "cusFeature",
                field = "balance",
                newValue = topLevelBalance - toDeduct
            })
            table.insert(stateChanges, {
                type = "cusFeature",
                field = "usage",
                delta = toDeduct
            })
            
            remaining = remaining - toDeduct
        end
        
        -- Deduct from top-level overage (if allowed)
        -- Continuous use features automatically allow overage
        local allowOverage = cusFeature.overage_allowed or cusFeature.type == "continuous_use"
        
        if remaining > 0 and allowOverage then
            local currentUsage = cusFeature.usage or 0
            local toDeduct = remaining
            
            -- If usage_limit is defined, cap the overage
            if cusFeature.usage_limit then
                local availableOverage = cusFeature.usage_limit - currentUsage
                if availableOverage > 0 then
                    toDeduct = math.min(remaining, availableOverage)
                else
                    toDeduct = 0
                end
            end
            
            if toDeduct > 0 then
                -- Collect Redis deltas
                table.insert(deltas, {key = cusFeature._key, field = "balance", delta = -toDeduct})
                table.insert(deltas, {key = cusFeature._key, field = "usage", delta = toDeduct})
                
                -- Collect state changes
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "balance",
                    delta = -toDeduct
                })
                table.insert(stateChanges, {
                    type = "cusFeature",
                    field = "usage",
                    delta = toDeduct
                })
                
                remaining = remaining - toDeduct
            end
        end
    end
    
        return {
        remaining = remaining,
        deltas = deltas,
        stateChanges = stateChanges
    }
end

-- Deduct from a single customer feature (handles rollovers + main balance)
-- Returns: { remaining: number, deltas: array, stateChanges: array }
local function deductFromCusFeature(cusFeature, amount)
    local allDeltas = {}
    local allStateChanges = {}
    
    -- Step 1: Deduct from rollovers first
    local rolloverResult = deductFromRollovers(cusFeature, amount)
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
        local mainResult = deductFromMainBalance(cusFeature, remaining)
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
                local entityRolloverResult = deductFromRollovers(entityFeature, remaining)
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
                local entityMainResult = deductFromMainBalance(entityFeature, remaining)
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
            local customerRolloverResult = deductFromRollovers(customerFeature, remaining)
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
            local customerMainResult = deductFromMainBalance(customerFeature, remaining)
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
        local customerRolloverResult = deductFromRollovers(customerFeature, remaining)
        remaining = customerRolloverResult.remaining
        for _, delta in ipairs(customerRolloverResult.deltas) do
            table.insert(allDeltas, delta)
        end
        for _, change in ipairs(customerRolloverResult.stateChanges) do
            table.insert(customerStateChanges, change)
        end
        
        -- Step 2: Deduct from customer main balance
        if remaining ~= 0 then
            local customerMainResult = deductFromMainBalance(customerFeature, remaining)
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
                    local entityRolloverResult = deductFromRollovers(entityFeature, remaining)
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
                    local entityMainResult = deductFromMainBalance(entityFeature, remaining)
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
-- This requires loading the MERGED balance (customer + all entities) to calculate the correct delta
local function calculateSyncDeltas(featureDeductions, targetBalance)
    -- Load merged customer features (customer + entities) to get accurate current balance
    local mergedFeatures = loadCusFeatures(cacheKey, orgId, env, customerId)
    
    if not mergedFeatures then
        return -- Customer not in cache, no-op
    end
    
    for _, featureDeduction in ipairs(featureDeductions) do
        local featureId = featureDeduction.featureId
        local mergedFeature = mergedFeatures[featureId]
        
        if mergedFeature and not mergedFeature.unlimited then
            -- Get current MERGED balance (includes entities)
            local currentBalance = mergedFeature.balance or 0
            
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
            local breakdown = cusFeature.breakdowns[change.index]
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
        calculateSyncDeltas(featureDeductions, targetBalance)
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
                if otherCusFeature.credit_schema then
                    -- Check if this credit system references our feature
                    for _, creditItem in ipairs(otherCusFeature.credit_schema) do
                        if creditItem.feature_id == featureId then
                            -- Calculate credit amount needed for remaining
                            local creditAmount = remainingAmount * creditItem.credit_amount
                            
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
                                    local originalCovered = creditCovered / creditItem.credit_amount
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

-- Get list of all customer feature IDs
local baseJson = redis.call("GET", cacheKey)
local allFeatureIds = {}
if baseJson then
    local baseCustomer = cjson.decode(baseJson)
    allFeatureIds = baseCustomer._featureIds or {}
end

-- Load all customer features (so we can find credit systems)
local loadedCusFeatures = {}
for _, featureId in ipairs(allFeatureIds) do
    local cusFeature = loadCusFeature(featureId)
    if cusFeature then
        loadedCusFeatures[featureId] = cusFeature
    end
end

-- Get entity IDs from customer
local baseCustomer = cjson.decode(baseJson)
local entityIds = baseCustomer._entityIds or {}

-- Load all entity features: { [entityId] = { [featureId] = entityFeature } }
local entityFeatureStates = {}
for _, entityId in ipairs(entityIds) do
    local entityCacheKey = "{" .. orgId .. "}:" .. env .. ":customer:" .. customerId .. ":entity:" .. entityId
    local entityBaseJson = redis.call("GET", entityCacheKey)
    
    if entityBaseJson then
        local entityBase = cjson.decode(entityBaseJson)
        local entityFeatureIds = entityBase._featureIds or {}
        entityFeatureStates[entityId] = {}
        
        for _, featureId in ipairs(entityFeatureIds) do
            -- Load entity feature inline (similar to loadCusFeature but with entity keys)
            local entityFeatureKey = entityCacheKey .. ":features:" .. featureId
            local entityFeatureHash = redis.call("HGETALL", entityFeatureKey)
            
            if #entityFeatureHash > 0 then
                local entityFeature = { id = featureId, _key = entityFeatureKey }
                
                -- Parse entity feature fields
                for i = 1, #entityFeatureHash, 2 do
                    local key = entityFeatureHash[i]
                    local value = entityFeatureHash[i + 1]
                    
                    if key == "balance" or key == "usage" or key == "usage_limit" or key == "included_usage" or key == "_breakdown_count" or key == "_rollover_count" then
                        entityFeature[key] = tonumber(value)
                    elseif key == "unlimited" or key == "overage_allowed" then
                        entityFeature[key] = (value == "true")
                    elseif key == "type" then
                        entityFeature[key] = value
                    elseif key == "credit_schema" then
                        if value ~= "null" and value ~= "" then
                            entityFeature[key] = cjson.decode(value)
                        else
                            entityFeature[key] = nil
                        end
                    elseif value == "null" then
                        entityFeature[key] = nil
                    else
                        entityFeature[key] = value
                    end
                end
                
                -- Load entity breakdowns
                local breakdownCount = entityFeature._breakdown_count or 0
                entityFeature.breakdowns = {}
                for i = 0, breakdownCount - 1 do
                    local breakdownKey = entityCacheKey .. ":features:" .. featureId .. ":breakdown:" .. i
                    local breakdownHash = redis.call("HGETALL", breakdownKey)
                    
                    if #breakdownHash > 0 then
                        local breakdown = { _index = i, _key = breakdownKey }
                        for j = 1, #breakdownHash, 2 do
                            local key = breakdownHash[j]
                            local value = breakdownHash[j + 1]
                            
                            if key == "balance" or key == "usage" or key == "usage_limit" then
                                breakdown[key] = tonumber(value)
                            elseif key == "overage_allowed" then
                                breakdown[key] = (value == "true")
                            else
                                breakdown[key] = value
                            end
                        end
                        table.insert(entityFeature.breakdowns, breakdown)
                    end
                end
                
                -- Load entity rollovers
                local rolloverCount = entityFeature._rollover_count or 0
                entityFeature.rollovers = {}
                for i = 0, rolloverCount - 1 do
                    local rolloverKey = entityCacheKey .. ":features:" .. featureId .. ":rollover:" .. i
                    local rolloverHash = redis.call("HGETALL", rolloverKey)
                    
                    if #rolloverHash > 0 then
                        local rollover = { _index = i, _key = rolloverKey }
                        for j = 1, #rolloverHash, 2 do
                            local key = rolloverHash[j]
                            local value = rolloverHash[j + 1]
                            
                            if key == "balance" or key == "expires_at" then
                                rollover[key] = tonumber(value)
                            else
                                rollover[key] = value
                            end
                        end
                        table.insert(entityFeature.rollovers, rollover)
                    end
                end
                
                entityFeatureStates[entityId][featureId] = entityFeature
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

-- Return results
return cjson.encode({
    success = true,
    results = results
})


