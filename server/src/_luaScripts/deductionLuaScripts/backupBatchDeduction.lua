-- batchDeduction.lua (BACKUP - Original code-generated version)
-- Atomically processes a batch of deductions for a specific target feature
-- Supports credit system features as alternative payment sources
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
-- KEYS[2]: target feature ID
-- ARGV[1]: JSON array of deduction amounts [10, 20, -5, 30, ...] (negative = additions)
-- ARGV[2]: overage_behavior ("reject" or "cap")

local cacheKey = KEYS[1]
local targetFeatureId = KEYS[2]
local amountsJson = ARGV[1]
local overageBehavior = ARGV[2] or "cap"

-- Parse amounts
local amounts = cjson.decode(amountsJson)

-- Base keys
local baseKey = cacheKey

-- Check if customer exists
local baseExists = redis.call("EXISTS", baseKey)
if baseExists == 0 then
    return cjson.encode({
        success = false,
        error = "CUSTOMER_NOT_FOUND",
        successCount = 0
    })
end

-- Load base customer to get all feature IDs
local baseJson = redis.call("GET", baseKey)
local baseCustomer = cjson.decode(baseJson)
local allFeatureIds = baseCustomer._featureIds or {}

-- Helper function: Load a complete feature with rollovers and breakdowns
local function loadFeature(featureId)
    local featureKey = cacheKey .. ":features:" .. featureId
    local featureHash = redis.call("HGETALL", featureKey)
    
    if #featureHash == 0 then
        return nil
    end
    
    -- Parse feature fields
    local feature = { id = featureId }
    for i = 1, #featureHash, 2 do
        local key = featureHash[i]
        local value = featureHash[i + 1]
        
        if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "_breakdown_count" or key == "_rollover_count" then
            feature[key] = tonumber(value)
        elseif key == "unlimited" or key == "overage_allowed" then
            feature[key] = (value == "true")
        elseif key == "credit_schema" then
            if value ~= "null" and value ~= "" then
                feature[key] = cjson.decode(value)
            else
                feature[key] = nil
            end
        elseif value == "null" then
            feature[key] = cjson.null
        else
            feature[key] = value
        end
    end
    
    -- Load rollovers
    local rolloverCount = feature._rollover_count or 0
    feature.rollovers = {}
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
            table.insert(feature.rollovers, rollover)
        end
    end
    
    -- Load breakdowns
    local breakdownCount = feature._breakdown_count or 0
    feature.breakdowns = {}
    for i = 0, breakdownCount - 1 do
        local breakdownKey = cacheKey .. ":features:" .. featureId .. ":breakdown:" .. i
        local breakdownHash = redis.call("HGETALL", breakdownKey)
        
        if #breakdownHash > 0 then
            local breakdown = { _index = i, _key = breakdownKey }
            for j = 1, #breakdownHash, 2 do
                local key = breakdownHash[j]
                local value = breakdownHash[j + 1]
                
                if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" then
                    breakdown[key] = tonumber(value)
                else
                    breakdown[key] = value
                end
            end
            table.insert(feature.breakdowns, breakdown)
        end
    end
    
    return feature
end

-- Helper function: Calculate credit cost
local function getCreditCost(feature, targetFeatureId)
    if not feature.credit_schema or type(feature.credit_schema) ~= "table" then
        return 1
    end
    
    for _, schemaItem in ipairs(feature.credit_schema) do
        if schemaItem.feature_id == targetFeatureId then
            local creditAmount = schemaItem.credit_cost or schemaItem.credit_amount or 1
            local featureAmount = schemaItem.feature_amount or 1
            return creditAmount / featureAmount
        end
    end
    
    return 1
end

-- Load all features and categorize
local regularFeatures = {}
local creditFeatures = {}

for _, featureId in ipairs(allFeatureIds) do
    local feature = loadFeature(featureId)
    
    if feature and not feature.unlimited then
        local creditCost = getCreditCost(feature, targetFeatureId)
        
        if featureId == targetFeatureId or creditCost == 1 then
            table.insert(regularFeatures, { feature = feature, creditCost = 1 })
        else
            table.insert(creditFeatures, { feature = feature, creditCost = creditCost })
        end
    end
end

-- Combine regular and credit features for deduction order
local allFeatures = {}
for _, item in ipairs(regularFeatures) do
    table.insert(allFeatures, item)
end
for _, item in ipairs(creditFeatures) do
    table.insert(allFeatures, item)
end

if #allFeatures == 0 then
    return cjson.encode({
        success = false,
        error = "NO_VALID_FEATURES",
        successCount = 0
    })
end

-- Separate additions (negative) from deductions (positive)
local additions = {}
local deductions = {}

for i, amount in ipairs(amounts) do
    if amount < 0 then
        table.insert(additions, { index = i, amount = amount })
    else
        table.insert(deductions, { index = i, amount = amount })
    end
end

-- Reorder: additions first, then deductions
local orderedRequests = {}
for _, item in ipairs(additions) do
    table.insert(orderedRequests, item)
end
for _, item in ipairs(deductions) do
    table.insert(orderedRequests, item)
end

-- Track accumulated changes per Redis key
local keyDeltas = {}  -- { [key] = { balance = delta, usage = delta } }

-- Helper: Add delta to key
local function addDelta(key, field, delta)
    if not keyDeltas[key] then
        keyDeltas[key] = {}
    end
    keyDeltas[key][field] = (keyDeltas[key][field] or 0) + delta
end

-- Helper: Calculate available balance from all features
local function calculateTotalAvailable()
    local available = 0
    
    for _, featureItem in ipairs(allFeatures) do
        local feature = featureItem.feature
        
        -- Rollovers
        for _, rollover in ipairs(feature.rollovers or {}) do
            if rollover.balance and rollover.balance > 0 then
                available = available + rollover.balance
            end
        end
        
        -- Breakdowns
        for _, breakdown in ipairs(feature.breakdowns or {}) do
            if breakdown.balance and breakdown.balance > 0 then
                available = available + breakdown.balance
            end
        end
        
        -- Top-level balance (if no breakdowns)
        if #(feature.breakdowns or {}) == 0 and feature.balance and feature.balance > 0 then
            available = feature.balance
        end
        
        -- Overage
        if feature.overage_allowed and feature.usage_limit then
            local remainingOverage = feature.usage_limit - (feature.usage or 0)
            if remainingOverage > 0 then
                available = available + remainingOverage
            end
        end
    end
    
    return available
end

-- Helper: Apply a single deduction amount across all features
local function applyDeduction(amount, featureItem)
    local feature = featureItem.feature
    local creditCost = featureItem.creditCost
    local remaining = amount
    local featureKey = cacheKey .. ":features:" .. feature.id
    
    -- Deduct from rollovers
    for _, rollover in ipairs(feature.rollovers or {}) do
        if remaining <= 0 then break end
        
        local rolloverBalance = rollover.balance or 0
        if rolloverBalance > 0 then
            local toDeduct = math.min(remaining, rolloverBalance)
            local actualDeduction = toDeduct * creditCost
            
            addDelta(rollover._key, "balance", -actualDeduction)
            
            rollover.balance = rolloverBalance - actualDeduction
            remaining = remaining - toDeduct
        end
    end
    
    -- Deduct from breakdowns
    if #(feature.breakdowns or {}) > 0 then
        for _, breakdown in ipairs(feature.breakdowns) do
            if remaining <= 0 then break end
            
            local breakdownBalance = breakdown.balance or 0
            if breakdownBalance > 0 then
                local toDeduct = math.min(remaining, breakdownBalance)
                local actualDeduction = toDeduct * creditCost
                
                addDelta(breakdown._key, "balance", -actualDeduction)
                addDelta(breakdown._key, "usage", actualDeduction)
                addDelta(featureKey, "balance", -actualDeduction)
                addDelta(featureKey, "usage", actualDeduction)
                
                breakdown.balance = breakdownBalance - actualDeduction
                feature.balance = (feature.balance or 0) - actualDeduction
                feature.usage = (feature.usage or 0) + actualDeduction
                remaining = remaining - toDeduct
            end
        end
    else
        -- No breakdowns, deduct from top-level
        local topLevelBalance = feature.balance or 0
        if topLevelBalance > 0 then
            local toDeduct = math.min(remaining, topLevelBalance)
            local actualDeduction = toDeduct * creditCost
            
            addDelta(featureKey, "balance", -actualDeduction)
            addDelta(featureKey, "usage", actualDeduction)
            
            feature.balance = topLevelBalance - actualDeduction
            feature.usage = (feature.usage or 0) + actualDeduction
            remaining = remaining - toDeduct
        end
    end
    
    -- Handle overage
    if remaining > 0 and feature.overage_allowed and feature.usage_limit then
        local currentUsage = feature.usage or 0
        local remainingOverage = feature.usage_limit - currentUsage
        
        if remainingOverage > 0 then
            local overageDeduct = math.min(remaining, remainingOverage)
            local actualOverageDeduction = overageDeduct * creditCost
            
            addDelta(featureKey, "usage", actualOverageDeduction)
            
            feature.usage = currentUsage + actualOverageDeduction
            remaining = remaining - overageDeduct
        end
    end
    
    return remaining == 0
end

-- Process all requests independently
local successCount = 0
local processedRequests = {}  -- Track which original indices succeeded

for _, request in ipairs(orderedRequests) do
    local amount = request.amount
    local originalIndex = request.index
    local succeeded = false
    
    -- Additions (negative amounts) always succeed
    if amount < 0 then
        -- Apply addition across features (reverse deduction)
        for _, featureItem in ipairs(allFeatures) do
            applyDeduction(amount, featureItem)
            break  -- Only apply to first feature for additions
        end
        succeeded = true
    else
        -- Deductions: check availability
        local available = calculateTotalAvailable()
        
        if available >= amount then
            -- Sufficient balance, apply full deduction
            local remaining = amount
            for _, featureItem in ipairs(allFeatures) do
                if remaining <= 0 then break end
                if applyDeduction(remaining, featureItem) then
                    remaining = 0
                    break
                end
            end
            
            if remaining == 0 then
                succeeded = true
            end
        elseif overageBehavior == "cap" then
            -- Cap behavior: deduct what's available (even if 0) and succeed
            if available > 0 then
                local remaining = available
                for _, featureItem in ipairs(allFeatures) do
                    if remaining <= 0 then break end
                    if applyDeduction(remaining, featureItem) then
                        remaining = 0
                        break
                    end
                end
            end
            succeeded = true -- Always succeed with cap behavior
        end
        -- else: insufficient and reject → don't deduct, don't mark success
    end
    
    processedRequests[originalIndex] = succeeded
    if succeeded then
        successCount = successCount + 1
    end
end

-- Execute accumulated changes (ONE HINCRBYFLOAT per key per field)
for key, deltas in pairs(keyDeltas) do
    for field, delta in pairs(deltas) do
        if delta ~= 0 then
            redis.call("HINCRBYFLOAT", key, field, delta)
        end
    end
end

-- Always return success=true (batch executed), individual requests resolved by successCount
return cjson.encode({
    success = true,
    successCount = successCount,
    error = successCount < #amounts and "INSUFFICIENT_BALANCE" or nil
})

