-- getCustomer.lua
-- Atomically retrieves a customer object from Redis, reconstructing from base JSON and feature HSETs
-- Merges master customer features with entity features
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
-- ARGV[1]: org_id (for building entity cache keys)
-- ARGV[2]: env (for building entity cache keys)

local cacheKey = KEYS[1]
local baseKey = cacheKey
local orgId = ARGV[1]
local env = ARGV[2]

-- Get base customer JSON
local baseJson = redis.call("GET", baseKey)
if not baseJson then
    return nil
end

local baseCustomer = cjson.decode(baseJson)
local featureIds = baseCustomer._featureIds or {}
local entityIds = baseCustomer._entityIds or {}

-- Build features object
local features = {}

for _, featureId in ipairs(featureIds) do
    local featureKey = cacheKey .. ":features:" .. featureId
    local featureHash = redis.call("HGETALL", featureKey)
    
    -- If feature key is missing, return nil (partial eviction detected)
    if #featureHash == 0 then
        return nil
    end
    
        -- Convert HGETALL result (flat array) to table
        local featureData = {}
        for i = 1, #featureHash, 2 do
            local key = featureHash[i]
            local value = featureHash[i + 1]
            
            -- Parse numeric values
            if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" or key == "_breakdown_count" or key == "_rollover_count" then
                featureData[key] = tonumber(value)
            elseif key == "unlimited" or key == "overage_allowed" then
                featureData[key] = (value == "true")
            elseif key == "credit_schema" then
                -- Parse credit_schema JSON array
                if value ~= "null" and value ~= "" then
                    featureData[key] = cjson.decode(value)
                else
                    featureData[key] = cjson.null
                end
            elseif value == "null" then
                featureData[key] = cjson.null
            else
                featureData[key] = value
            end
        end
    
    -- Get rollover count
    local rolloverCount = featureData._rollover_count or 0
    featureData._rollover_count = nil -- Remove from final output
    
    -- Fetch rollover items
    local rollovers = {}
    for i = 0, rolloverCount - 1 do
        local rolloverKey = cacheKey .. ":features:" .. featureId .. ":rollover:" .. i
        local rolloverHash = redis.call("HGETALL", rolloverKey)
        
        -- If rollover key is missing, return nil (partial eviction detected)
        if #rolloverHash == 0 then
            return nil
        end
        
        local rolloverData = {}
        for j = 1, #rolloverHash, 2 do
            local key = rolloverHash[j]
            local value = rolloverHash[j + 1]
            
            if key == "balance" or key == "expires_at" then
                rolloverData[key] = tonumber(value)
            elseif value == "null" then
                rolloverData[key] = cjson.null
            else
                rolloverData[key] = value
            end
        end
        table.insert(rollovers, rolloverData)
    end
    
    if #rollovers > 0 then
        featureData.rollovers = rollovers
    end
    
    -- Get breakdown count
    local breakdownCount = featureData._breakdown_count or 0
    featureData._breakdown_count = nil -- Remove from final output
    
    -- Fetch breakdown items
    local breakdown = {}
    for i = 0, breakdownCount - 1 do
        local breakdownKey = cacheKey .. ":features:" .. featureId .. ":breakdown:" .. i
        local breakdownHash = redis.call("HGETALL", breakdownKey)
        
        -- If breakdown key is missing, return nil (partial eviction detected)
        if #breakdownHash == 0 then
            return nil
        end
        
                local breakdownData = {}
                for j = 1, #breakdownHash, 2 do
                    local key = breakdownHash[j]
                    local value = breakdownHash[j + 1]
                    
                    if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" then
                        breakdownData[key] = tonumber(value)
                    elseif key == "overage_allowed" then
                        breakdownData[key] = (value == "true")
                    elseif value == "null" then
                        breakdownData[key] = cjson.null
                    else
                        breakdownData[key] = value
                    end
                end
                table.insert(breakdown, breakdownData)
    end
    
    if #breakdown > 0 then
        featureData.breakdown = breakdown
    end
    
    features[featureId] = featureData
end

-- ============================================================================
-- FETCH AND MERGE ENTITY FEATURES
-- ============================================================================

-- Fetch all entity features and aggregate balances
local entityFeatureData = {} -- {[entityId][featureId] = featureData}

for _, entityId in ipairs(entityIds) do
    local entityCacheKey = "{" .. orgId .. "}:" .. env .. ":entity:" .. entityId
    local entityBaseJson = redis.call("GET", entityCacheKey)
    
    if entityBaseJson then
        local entityBase = cjson.decode(entityBaseJson)
        local entityFeatureIds = entityBase._featureIds or {}
        entityFeatureData[entityId] = {}
        
        for _, featureId in ipairs(entityFeatureIds) do
            local entityFeatureKey = entityCacheKey .. ":features:" .. featureId
            local entityFeatureHash = redis.call("HGETALL", entityFeatureKey)
            
            if #entityFeatureHash > 0 then
                -- Parse entity feature
                local entityFeature = {}
                for i = 1, #entityFeatureHash, 2 do
                    local key = entityFeatureHash[i]
                    local value = entityFeatureHash[i + 1]
                    
                    if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" or key == "_breakdown_count" or key == "_rollover_count" then
                        entityFeature[key] = tonumber(value)
                    elseif key == "unlimited" or key == "overage_allowed" then
                        entityFeature[key] = (value == "true")
                    elseif value == "null" then
                        entityFeature[key] = cjson.null
                    else
                        entityFeature[key] = value
                    end
                end
                
                -- Fetch breakdown items for this entity feature
                local breakdownCount = entityFeature._breakdown_count or 0
                entityFeature._breakdown_count = nil
                entityFeature.breakdowns = {}
                
                for i = 0, breakdownCount - 1 do
                    local breakdownKey = entityFeatureKey .. ":breakdown:" .. i
                    local breakdownHash = redis.call("HGETALL", breakdownKey)
                    
                    if #breakdownHash > 0 then
                        local breakdownData = {}
                        for j = 1, #breakdownHash, 2 do
                            local key = breakdownHash[j]
                            local value = breakdownHash[j + 1]
                            
                            if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" then
                                breakdownData[key] = tonumber(value)
                            elseif key == "overage_allowed" then
                                breakdownData[key] = (value == "true")
                            elseif value == "null" then
                                breakdownData[key] = cjson.null
                            else
                                breakdownData[key] = value
                            end
                        end
                        table.insert(entityFeature.breakdowns, breakdownData)
                    end
                end
                
                -- Fetch rollover items for this entity feature
                local rolloverCount = entityFeature._rollover_count or 0
                entityFeature._rollover_count = nil
                entityFeature.rollovers = {}
                
                for i = 0, rolloverCount - 1 do
                    local rolloverKey = entityFeatureKey .. ":rollover:" .. i
                    local rolloverHash = redis.call("HGETALL", rolloverKey)
                    
                    if #rolloverHash > 0 then
                        local rolloverData = {}
                        for j = 1, #rolloverHash, 2 do
                            local key = rolloverHash[j]
                            local value = rolloverHash[j + 1]
                            
                            if key == "balance" or key == "expires_at" then
                                rolloverData[key] = tonumber(value)
                            elseif value == "null" then
                                rolloverData[key] = cjson.null
                            else
                                rolloverData[key] = value
                            end
                        end
                        table.insert(entityFeature.rollovers, rolloverData)
                    end
                end
                
                entityFeatureData[entityId][featureId] = entityFeature
            end
        end
    end
end

-- ============================================================================
-- MERGE ENTITY BALANCES INTO CUSTOMER FEATURES
-- ============================================================================

for featureId, customerFeature in pairs(features) do
    -- Skip if unlimited
    if not customerFeature.unlimited then
        -- Aggregate entity balances for this feature
        local entityTotalBalance = 0
        local entityTotalUsage = 0
        local entityTotalIncludedUsage = 0
        local entityTotalUsageLimit = 0
        
        for entityId, entityFeatures in pairs(entityFeatureData) do
            local entityFeature = entityFeatures[featureId]
            if entityFeature then
                entityTotalBalance = entityTotalBalance + (entityFeature.balance or 0)
                entityTotalUsage = entityTotalUsage + (entityFeature.usage or 0)
                entityTotalIncludedUsage = entityTotalIncludedUsage + (entityFeature.included_usage or 0)
                entityTotalUsageLimit = entityTotalUsageLimit + (entityFeature.usage_limit or 0)
            end
        end
        
        -- Merge top-level balance and usage
        customerFeature.balance = (customerFeature.balance or 0) + entityTotalBalance
        customerFeature.usage = (customerFeature.usage or 0) + entityTotalUsage
        customerFeature.included_usage = (customerFeature.included_usage or 0) + entityTotalIncludedUsage
        customerFeature.usage_limit = (customerFeature.usage_limit or 0) + entityTotalUsageLimit
        
        -- Merge breakdown balances and usage
        if customerFeature.breakdown and #customerFeature.breakdown > 0 then
            for i, breakdown in ipairs(customerFeature.breakdown) do
                local entityBreakdownBalance = 0
                local entityBreakdownUsage = 0
                local entityBreakdownIncludedUsage = 0
                local entityBreakdownUsageLimit = 0
                
                for entityId, entityFeatures in pairs(entityFeatureData) do
                    local entityFeature = entityFeatures[featureId]
                    if entityFeature and entityFeature.breakdowns and entityFeature.breakdowns[i] then
                        entityBreakdownBalance = entityBreakdownBalance + (entityFeature.breakdowns[i].balance or 0)
                        entityBreakdownUsage = entityBreakdownUsage + (entityFeature.breakdowns[i].usage or 0)
                        entityBreakdownIncludedUsage = entityBreakdownIncludedUsage + (entityFeature.breakdowns[i].included_usage or 0)
                        entityBreakdownUsageLimit = entityBreakdownUsageLimit + (entityFeature.breakdowns[i].usage_limit or 0)
                    end
                end
                
                breakdown.balance = (breakdown.balance or 0) + entityBreakdownBalance
                breakdown.usage = (breakdown.usage or 0) + entityBreakdownUsage
                breakdown.included_usage = (breakdown.included_usage or 0) + entityBreakdownIncludedUsage
                breakdown.usage_limit = (breakdown.usage_limit or 0) + entityBreakdownUsageLimit
            end
        end
        
        -- Merge rollover balances
        if customerFeature.rollovers and #customerFeature.rollovers > 0 then
            for i, rollover in ipairs(customerFeature.rollovers) do
                local entityRolloverBalance = 0
                
                for entityId, entityFeatures in pairs(entityFeatureData) do
                    local entityFeature = entityFeatures[featureId]
                    if entityFeature and entityFeature.rollovers and entityFeature.rollovers[i] then
                        entityRolloverBalance = entityRolloverBalance + (entityFeature.rollovers[i].balance or 0)
                    end
                end
                
                rollover.balance = (rollover.balance or 0) + entityRolloverBalance
            end
        end
    end
end

-- Add entity-only features (features that exist in entities but not in customer)
for entityId, entityFeatures in pairs(entityFeatureData) do
    for featureId, entityFeature in pairs(entityFeatures) do
        if not features[featureId] then
            -- This feature doesn't exist in customer, add it
            -- Initialize with zero balance, then we'll aggregate all entity balances
            if not features[featureId] then
                features[featureId] = {
                    id = entityFeature.id,
                    type = entityFeature.type,
                    name = entityFeature.name,
                    interval = entityFeature.interval,
                    interval_count = entityFeature.interval_count,
                    unlimited = entityFeature.unlimited,
                    balance = 0,
                    usage = 0,
                    included_usage = 0,
                    next_reset_at = cjson.null,
                    overage_allowed = entityFeature.overage_allowed,
                    usage_limit = entityFeature.usage_limit,
                    credit_schema = entityFeature.credit_schema
                }
            end
        end
    end
end

-- Now aggregate balances for entity-only features
for featureId, customerFeature in pairs(features) do
    -- Only process if this was an entity-only feature (balance is still 0 from initialization)
    if customerFeature.balance == 0 and customerFeature.usage == 0 then
        local entityTotalBalance = 0
        local entityTotalUsage = 0
        local entityTotalIncludedUsage = 0
        local entityTotalUsageLimit = 0
        local minNextResetAt = nil
        
        for entityId, entityFeatures in pairs(entityFeatureData) do
            local entityFeature = entityFeatures[featureId]
            if entityFeature then
                entityTotalBalance = entityTotalBalance + (entityFeature.balance or 0)
                entityTotalUsage = entityTotalUsage + (entityFeature.usage or 0)
                entityTotalIncludedUsage = entityTotalIncludedUsage + (entityFeature.included_usage or 0)
                entityTotalUsageLimit = entityTotalUsageLimit + (entityFeature.usage_limit or 0)
                
                -- Find minimum next_reset_at across all entities
                if entityFeature.next_reset_at then
                    if not minNextResetAt or entityFeature.next_reset_at < minNextResetAt then
                        minNextResetAt = entityFeature.next_reset_at
                    end
                end
            end
        end
        
        customerFeature.balance = entityTotalBalance
        customerFeature.usage = entityTotalUsage
        customerFeature.included_usage = entityTotalIncludedUsage
        customerFeature.usage_limit = entityTotalUsageLimit
        customerFeature.next_reset_at = minNextResetAt or cjson.null
    end
end

-- Build final customer object
baseCustomer._featureIds = nil -- Remove tracking field
baseCustomer._entityIds = nil -- Remove tracking field
baseCustomer.features = features

return cjson.encode(baseCustomer)

