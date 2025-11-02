-- batchDeduction.lua
-- Atomically processes a batch of deductions for a specific target feature
-- Supports credit system features as alternative payment sources
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
-- KEYS[2]: target feature ID
-- ARGV[1]: JSON array of deduction amounts [10, 20, 30, ...]

local cacheKey = KEYS[1]
local targetFeatureId = KEYS[2]
local amountsJson = ARGV[1]

-- Parse amounts
local amounts = cjson.decode(amountsJson)

-- Base keys
local baseKey = "customer:" .. cacheKey

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
    local featureKey = "customer:" .. cacheKey .. ":features:" .. featureId
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
            -- Parse credit_schema JSON array
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
        local rolloverKey = "customer:" .. cacheKey .. ":features:" .. featureId .. ":rollover:" .. i
        local rolloverHash = redis.call("HGETALL", rolloverKey)
        
        if #rolloverHash > 0 then
            local rollover = { _index = i }
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
        local breakdownKey = "customer:" .. cacheKey .. ":features:" .. featureId .. ":breakdown:" .. i
        local breakdownHash = redis.call("HGETALL", breakdownKey)
        
        if #breakdownHash > 0 then
            local breakdown = { _index = i }
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

-- Helper function: Calculate credit cost for a feature against target feature
local function getCreditCost(feature, targetFeatureId)
    -- Check if feature has credit_schema
    if not feature.credit_schema or type(feature.credit_schema) ~= "table" then
        return 1
    end
    
    -- Look for targetFeatureId in credit_schema
    for _, schemaItem in ipairs(feature.credit_schema) do
        if schemaItem.feature_id == targetFeatureId then
            local creditAmount = schemaItem.credit_cost or schemaItem.credit_amount or 1
            local featureAmount = schemaItem.feature_amount or 1
            return creditAmount / featureAmount
        end
    end
    
    return 1
end

-- Helper function: Calculate available balance for a feature
local function calculateAvailableBalance(feature)
    local available = 0
    
    -- Add rollover balances
    for _, rollover in ipairs(feature.rollovers or {}) do
        if rollover.balance and rollover.balance > 0 then
            available = available + rollover.balance
        end
    end
    
    -- Add breakdown balances
    for _, breakdown in ipairs(feature.breakdowns or {}) do
        if breakdown.balance and breakdown.balance > 0 then
            available = available + breakdown.balance
        end
    end
    
    -- If no breakdowns, use top-level balance
    if #(feature.breakdowns or {}) == 0 and feature.balance and feature.balance > 0 then
        available = feature.balance
    end
    
    -- Check overage allowance
    if feature.overage_allowed and feature.usage_limit then
        local remainingOverage = feature.usage_limit - (feature.usage or 0)
        if remainingOverage > 0 then
            available = available + remainingOverage
        end
    end
    
    return available
end

-- Helper function: Deduct from a single feature with credit cost multiplier
local function deductFromFeature(amount, feature, creditCost)
    local remaining = amount
    local topLevelDeducted = 0
    local featureKey = "customer:" .. cacheKey .. ":features:" .. feature.id
    
    -- PASS 1: Deduct from rollovers first
    if #(feature.rollovers or {}) > 0 then
        for _, rollover in ipairs(feature.rollovers) do
            if remaining <= 0 then break end
            
            local rolloverBalance = rollover.balance or 0
            if rolloverBalance > 0 then
                local toDeduct = math.min(remaining, rolloverBalance)
                local actualDeduction = toDeduct * creditCost
                
                -- Update rollover balance using HINCRBYFLOAT
                local rolloverKey = "customer:" .. cacheKey .. ":features:" .. feature.id .. ":rollover:" .. rollover._index
                redis.call("HINCRBYFLOAT", rolloverKey, "balance", -actualDeduction)
                
                remaining = remaining - toDeduct
                topLevelDeducted = topLevelDeducted + actualDeduction
            end
        end
    end
    
    -- PASS 2: Deduct from breakdowns
    if #(feature.breakdowns or {}) > 0 then
        for _, breakdown in ipairs(feature.breakdowns) do
            if remaining <= 0 then break end
            
            local breakdownBalance = breakdown.balance or 0
            if breakdownBalance > 0 then
                local toDeduct = math.min(remaining, breakdownBalance)
                local actualDeduction = toDeduct * creditCost
                
                -- Update breakdown balance
                local breakdownKey = "customer:" .. cacheKey .. ":features:" .. feature.id .. ":breakdown:" .. breakdown._index
                redis.call("HINCRBYFLOAT", breakdownKey, "balance", -actualDeduction)
                redis.call("HINCRBYFLOAT", breakdownKey, "usage", actualDeduction)
                
                remaining = remaining - toDeduct
                topLevelDeducted = topLevelDeducted + actualDeduction
            end
        end
    else
        -- PASS 3: No breakdowns, deduct from top-level balance
        local topLevelBalance = feature.balance or 0
        if topLevelBalance > 0 then
            local toDeduct = math.min(remaining, topLevelBalance)
            local actualDeduction = toDeduct * creditCost
            topLevelDeducted = actualDeduction
            remaining = remaining - toDeduct
        end
    end
    
    -- Update top-level balance and usage
    if topLevelDeducted > 0 then
        redis.call("HINCRBYFLOAT", featureKey, "balance", -topLevelDeducted)
        redis.call("HINCRBYFLOAT", featureKey, "usage", topLevelDeducted)
    end
    
    -- PASS 4: Handle overage if allowed
    if remaining > 0 and feature.overage_allowed and feature.usage_limit then
        local currentUsage = (feature.usage or 0) + topLevelDeducted
        local remainingOverage = feature.usage_limit - currentUsage
        
        if remainingOverage > 0 then
            local overageDeduct = math.min(remaining, remainingOverage)
            local actualOverageDeduction = overageDeduct * creditCost
            redis.call("HINCRBYFLOAT", featureKey, "usage", actualOverageDeduction)
            -- Note: balance stays at 0, only usage increases for overage
            remaining = remaining - overageDeduct
        end
    end
    
    return remaining
end

-- Load all features and categorize them
local regularFeatures = {}
local creditFeatures = {}

for _, featureId in ipairs(allFeatureIds) do
    local feature = loadFeature(featureId)
    
    if feature then
        -- Skip unlimited features
        if not feature.unlimited then
            local creditCost = getCreditCost(feature, targetFeatureId)
            
            if featureId == targetFeatureId or creditCost == 1 then
                -- Regular feature (either target or no credit relationship)
                table.insert(regularFeatures, { feature = feature, creditCost = 1 })
            else
                -- Credit feature (can pay for target with multiplier)
                table.insert(creditFeatures, { feature = feature, creditCost = creditCost })
            end
        end
    end
end

-- Check if target feature exists
if #regularFeatures == 0 and #creditFeatures == 0 then
    return cjson.encode({
        success = false,
        error = "NO_VALID_FEATURES",
        successCount = 0
    })
end

-- Process batch of deductions with two-pass approach
local successCount = 0

for i, amount in ipairs(amounts) do
    local remaining = amount
    
    -- PASS 1: Try regular features first (including target feature)
    for _, item in ipairs(regularFeatures) do
        if remaining <= 0 then break end
        
        -- Only deduct if feature has available balance
        local available = calculateAvailableBalance(item.feature)
        if available > 0 then
            remaining = deductFromFeature(remaining, item.feature, item.creditCost)
        end
    end
    
    -- PASS 2: Try credit features if regular features exhausted
    if remaining > 0 then
        for _, item in ipairs(creditFeatures) do
            if remaining <= 0 then break end
            
            -- Only deduct if feature has available balance
            local available = calculateAvailableBalance(item.feature)
            if available > 0 then
                remaining = deductFromFeature(remaining, item.feature, item.creditCost)
            end
        end
    end
    
    if remaining == 0 then
        successCount = successCount + 1
    else
        -- Stop processing batch on first failure
        break
    end
end

return cjson.encode({
    success = true,
    successCount = successCount,
    error = successCount < #amounts and "INSUFFICIENT_BALANCE" or nil
})
