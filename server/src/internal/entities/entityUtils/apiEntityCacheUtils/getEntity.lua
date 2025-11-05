-- getEntity.lua
-- Atomically retrieves an entity object from Redis, reconstructing from base JSON and feature HSETs
-- Merges entity features with customer features
-- KEYS[1]: cache key (e.g., "{org_id}:env:entity:entity_id")
-- ARGV[1]: org_id (for building customer cache keys)
-- ARGV[2]: env (for building customer cache keys)

local cacheKey = KEYS[1]
local baseKey = cacheKey
local orgId = ARGV[1]
local env = ARGV[2]

-- Get base entity JSON
local baseJson = redis.call("GET", baseKey)
if not baseJson then
    return nil
end

local baseEntity = cjson.decode(baseJson)
local entityFeatureIds = baseEntity._featureIds or {}

-- ============================================================================
-- FETCH ENTITY FEATURES
-- ============================================================================
local entityFeatures = {}

for _, featureId in ipairs(entityFeatureIds) do
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
    
    entityFeatures[featureId] = featureData
end

-- ============================================================================
-- FETCH CUSTOMER MASTER FEATURES (no entity aggregation)
-- ============================================================================
local customerFeatures = {}
local customerId = baseEntity.customer_id

if customerId then
    local customerCacheKey = "{" .. orgId .. "}:" .. env .. ":customer:" .. customerId
    local customerBaseJson = redis.call("GET", customerCacheKey)
    
    if customerBaseJson then
        local customerBase = cjson.decode(customerBaseJson)
        local customerFeatureIds = customerBase._featureIds or {}
        
        for _, featureId in ipairs(customerFeatureIds) do
            local customerFeatureKey = customerCacheKey .. ":features:" .. featureId
            local customerFeatureHash = redis.call("HGETALL", customerFeatureKey)
            
            if #customerFeatureHash > 0 then
                -- Parse customer feature
                local customerFeature = {}
                for i = 1, #customerFeatureHash, 2 do
                    local key = customerFeatureHash[i]
                    local value = customerFeatureHash[i + 1]
                    
                    if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" or key == "_breakdown_count" or key == "_rollover_count" then
                        customerFeature[key] = tonumber(value)
                    elseif key == "unlimited" or key == "overage_allowed" then
                        customerFeature[key] = (value == "true")
                    elseif key == "credit_schema" then
                        if value ~= "null" and value ~= "" then
                            customerFeature[key] = cjson.decode(value)
                        else
                            customerFeature[key] = cjson.null
                        end
                    elseif value == "null" then
                        customerFeature[key] = cjson.null
                    else
                        customerFeature[key] = value
                    end
                end
                
                -- Fetch rollover items
                local rolloverCount = customerFeature._rollover_count or 0
                customerFeature._rollover_count = nil
                local rollovers = {}
                
                for i = 0, rolloverCount - 1 do
                    local rolloverKey = customerFeatureKey .. ":rollover:" .. i
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
                        table.insert(rollovers, rolloverData)
                    end
                end
                
                if #rollovers > 0 then
                    customerFeature.rollovers = rollovers
                end
                
                -- Fetch breakdown items
                local breakdownCount = customerFeature._breakdown_count or 0
                customerFeature._breakdown_count = nil
                local breakdown = {}
                
                for i = 0, breakdownCount - 1 do
                    local breakdownKey = customerFeatureKey .. ":breakdown:" .. i
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
                        table.insert(breakdown, breakdownData)
                    end
                end
                
                if #breakdown > 0 then
                    customerFeature.breakdown = breakdown
                end
                
                customerFeatures[featureId] = customerFeature
            end
        end
    end
end

-- ============================================================================
-- MERGE CUSTOMER AND ENTITY FEATURES
-- ============================================================================
local mergedFeatures = {}

-- First, add all customer features (inherited)
for featureId, customerFeature in pairs(customerFeatures) do
    mergedFeatures[featureId] = customerFeature
end

-- Then, merge or add entity features
for featureId, entityFeature in pairs(entityFeatures) do
    local customerFeature = customerFeatures[featureId]
    
    if customerFeature then
        -- Both customer and entity have this feature - merge balances
        if not entityFeature.unlimited and not customerFeature.unlimited then
            entityFeature.balance = (entityFeature.balance or 0) + (customerFeature.balance or 0)
            entityFeature.usage = (entityFeature.usage or 0) + (customerFeature.usage or 0)
            entityFeature.included_usage = (entityFeature.included_usage or 0) + (customerFeature.included_usage or 0)
            entityFeature.usage_limit = (entityFeature.usage_limit or 0) + (customerFeature.usage_limit or 0)
            
            -- Use minimum next_reset_at (earliest reset time)
            if entityFeature.next_reset_at and customerFeature.next_reset_at then
                if customerFeature.next_reset_at < entityFeature.next_reset_at then
                    entityFeature.next_reset_at = customerFeature.next_reset_at
                end
            elseif customerFeature.next_reset_at then
                entityFeature.next_reset_at = customerFeature.next_reset_at
            end
            
            -- Merge breakdown balances
            if entityFeature.breakdown and customerFeature.breakdown then
                for i, entityBreakdown in ipairs(entityFeature.breakdown) do
                    local customerBreakdown = customerFeature.breakdown[i]
                    if customerBreakdown then
                        entityBreakdown.balance = (entityBreakdown.balance or 0) + (customerBreakdown.balance or 0)
                        entityBreakdown.usage = (entityBreakdown.usage or 0) + (customerBreakdown.usage or 0)
                        entityBreakdown.included_usage = (entityBreakdown.included_usage or 0) + (customerBreakdown.included_usage or 0)
                        entityBreakdown.usage_limit = (entityBreakdown.usage_limit or 0) + (customerBreakdown.usage_limit or 0)
                        
                        -- Use minimum next_reset_at for breakdown
                        if entityBreakdown.next_reset_at and customerBreakdown.next_reset_at then
                            if customerBreakdown.next_reset_at < entityBreakdown.next_reset_at then
                                entityBreakdown.next_reset_at = customerBreakdown.next_reset_at
                            end
                        elseif customerBreakdown.next_reset_at then
                            entityBreakdown.next_reset_at = customerBreakdown.next_reset_at
                        end
                    end
                end
            end
            
            -- Merge rollover balances
            if entityFeature.rollovers and customerFeature.rollovers then
                for i, entityRollover in ipairs(entityFeature.rollovers) do
                    local customerRollover = customerFeature.rollovers[i]
                    if customerRollover then
                        entityRollover.balance = (entityRollover.balance or 0) + (customerRollover.balance or 0)
                    end
                end
            end
        end
        mergedFeatures[featureId] = entityFeature
    else
        -- Only entity has this feature - use entity's feature
        mergedFeatures[featureId] = entityFeature
    end
end

-- Build final entity object
baseEntity._featureIds = nil -- Remove tracking field
baseEntity.features = mergedFeatures

return cjson.encode(baseEntity)

