-- getCustomer.lua
-- Atomically retrieves a customer object from Redis, reconstructing from base JSON and feature HSETs
-- Merges master customer features with entity features
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
-- ARGV[1]: org_id (for building entity cache keys)
-- ARGV[2]: env (for building entity cache keys)
-- ARGV[3]: customer_id (for building entity cache keys)

-- Helper function to safely convert values to numbers for arithmetic
-- Returns the value if it's a number, otherwise returns 0
local function toNum(value)
    return type(value) == "number" and value or 0
end

-- Helper function to merge products array by product ID and normalized status
-- Groups products by key (product_id:normalized_status) and merges quantities
local function mergeProducts(productsArray)
    if not productsArray or #productsArray == 0 then
        return {}
    end
    
    -- Helper function to get product key for grouping
    local function getProductKey(product)
        local status = product.status
        -- Normalize status: "active" or "past_due" -> "active", otherwise use actual status
        if status == "active" or status == "past_due" then
            status = "active"
        end
        return product.id .. ":" .. status
    end
    
    local record = {}
    
    for _, curr in ipairs(productsArray) do
        local key = getProductKey(curr)
        local latest = record[key]
        
        local currStartedAt = curr.started_at
        
        -- Start with latest (or current if no latest exists), then override specific fields
        local mergedProduct = {}
        if latest then
            -- Copy all fields from latest first
            for k, v in pairs(latest) do
                mergedProduct[k] = v
            end
        else
            -- Copy all fields from current
            for k, v in pairs(curr) do
                mergedProduct[k] = v
            end
        end
        
        -- Apply merge logic for specific fields
        if latest then
            -- version: max(latest.version or 1, current.version or 1)
            local latestVersion = latest.version or 1
            local currVersion = curr.version or 1
            mergedProduct.version = math.max(latestVersion, currVersion)
            
            -- canceled_at: current.canceled_at if exists, else latest.canceled_at, else null
            if curr.canceled_at and curr.canceled_at ~= cjson.null and curr.canceled_at ~= nil then
                mergedProduct.canceled_at = curr.canceled_at
            elseif latest.canceled_at and latest.canceled_at ~= cjson.null and latest.canceled_at ~= nil then
                mergedProduct.canceled_at = latest.canceled_at
            else
                mergedProduct.canceled_at = cjson.null
            end
            
            -- started_at: latest.started_at ? min(latest.started_at, current.started_at) : current.started_at
            if latest.started_at then
                mergedProduct.started_at = math.min(latest.started_at, currStartedAt)
            else
                mergedProduct.started_at = currStartedAt
            end
            
            -- quantity: (latest.quantity or 0) + (current.quantity or 0)
            local latestQuantity = latest.quantity or 0
            local currQuantity = curr.quantity or 0
            mergedProduct.quantity = latestQuantity + currQuantity
        else
            -- First product in group, ensure defaults
            mergedProduct.version = curr.version or 1
            mergedProduct.canceled_at = curr.canceled_at or cjson.null
            mergedProduct.started_at = currStartedAt
            mergedProduct.quantity = curr.quantity or 0
        end
        
        record[key] = mergedProduct
    end
    
    -- Convert record back to array
    local mergedProducts = {}
    for _, product in pairs(record) do
        table.insert(mergedProducts, product)
    end
    
    return mergedProducts
end

local cacheKey = KEYS[1]
local baseKey = cacheKey
local orgId = ARGV[1]
local env = ARGV[2]
local customerId = ARGV[3]

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
            
            -- Check for null first before parsing
            if value == "null" then
                featureData[key] = cjson.null
            elseif key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" or key == "_breakdown_count" or key == "_rollover_count" then
                featureData[key] = tonumber(value)
            elseif key == "unlimited" or key == "overage_allowed" then
                featureData[key] = (value == "true")
            elseif key == "credit_schema" then
                -- Parse credit_schema JSON array
                if value ~= "" then
                    featureData[key] = cjson.decode(value)
                else
                    featureData[key] = cjson.null
                end
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
            
            if value == "null" then
                rolloverData[key] = cjson.null
            elseif key == "balance" or key == "expires_at" then
                rolloverData[key] = tonumber(value)
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
                    
                    if value == "null" then
                        breakdownData[key] = cjson.null
                    elseif key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" then
                        breakdownData[key] = tonumber(value)
                    elseif key == "overage_allowed" then
                        breakdownData[key] = (value == "true")
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
local entityBaseData = {} -- {[entityId] = entityBase} - Store entity base for product access

for _, entityId in ipairs(entityIds) do
    local entityCacheKey = "{" .. orgId .. "}:" .. env .. ":customer:" .. customerId .. ":entity:" .. entityId
    local entityBaseJson = redis.call("GET", entityCacheKey)
    
    if entityBaseJson then
        local entityBase = cjson.decode(entityBaseJson)
        entityBaseData[entityId] = entityBase -- Store entity base for product access
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
                    
                    if value == "null" then
                        entityFeature[key] = cjson.null
                    elseif key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" or key == "_breakdown_count" or key == "_rollover_count" then
                        entityFeature[key] = tonumber(value)
                    elseif key == "unlimited" or key == "overage_allowed" then
                        entityFeature[key] = (value == "true")
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
                            
                            if value == "null" then
                                breakdownData[key] = cjson.null
                            elseif key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "next_reset_at" then
                                breakdownData[key] = tonumber(value)
                            elseif key == "overage_allowed" then
                                breakdownData[key] = (value == "true")
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
                            
                            if value == "null" then
                                rolloverData[key] = cjson.null
                            elseif key == "balance" or key == "expires_at" then
                                rolloverData[key] = tonumber(value)
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
-- MERGE ENTITY PRODUCTS INTO CUSTOMER PRODUCTS
-- ============================================================================

-- Collect all products: start with customer's products, then add all entity products
local allProducts = {}
if baseCustomer.products then
    for _, product in ipairs(baseCustomer.products) do
        table.insert(allProducts, product)
    end
end

-- Add products from each entity
for _, entityId in ipairs(entityIds) do
    local entityBase = entityBaseData[entityId]
    if entityBase and entityBase.products then
        for _, product in ipairs(entityBase.products) do
            table.insert(allProducts, product)
        end
    end
end

-- Merge products by product ID and normalized status
baseCustomer.products = mergeProducts(allProducts)

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
                entityTotalBalance = entityTotalBalance + toNum(entityFeature.balance)
                entityTotalUsage = entityTotalUsage + toNum(entityFeature.usage)
                entityTotalIncludedUsage = entityTotalIncludedUsage + toNum(entityFeature.included_usage)
                entityTotalUsageLimit = entityTotalUsageLimit + toNum(entityFeature.usage_limit)
            end
        end
        
        -- Merge top-level balance and usage
        customerFeature.balance = toNum(customerFeature.balance) + entityTotalBalance
        customerFeature.usage = toNum(customerFeature.usage) + entityTotalUsage
        customerFeature.included_usage = toNum(customerFeature.included_usage) + entityTotalIncludedUsage
        customerFeature.usage_limit = toNum(customerFeature.usage_limit) + entityTotalUsageLimit
        
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
                        entityBreakdownBalance = entityBreakdownBalance + toNum(entityFeature.breakdowns[i].balance)
                        entityBreakdownUsage = entityBreakdownUsage + toNum(entityFeature.breakdowns[i].usage)
                        entityBreakdownIncludedUsage = entityBreakdownIncludedUsage + toNum(entityFeature.breakdowns[i].included_usage)
                        entityBreakdownUsageLimit = entityBreakdownUsageLimit + toNum(entityFeature.breakdowns[i].usage_limit)
                    end
                end
                
                breakdown.balance = toNum(breakdown.balance) + entityBreakdownBalance
                breakdown.usage = toNum(breakdown.usage) + entityBreakdownUsage
                breakdown.included_usage = toNum(breakdown.included_usage) + entityBreakdownIncludedUsage
                breakdown.usage_limit = toNum(breakdown.usage_limit) + entityBreakdownUsageLimit
            end
        end
        
        -- Merge rollover balances
        if customerFeature.rollovers and #customerFeature.rollovers > 0 then
            for i, rollover in ipairs(customerFeature.rollovers) do
                local entityRolloverBalance = 0
                
                for entityId, entityFeatures in pairs(entityFeatureData) do
                    local entityFeature = entityFeatures[featureId]
                    if entityFeature and entityFeature.rollovers and entityFeature.rollovers[i] then
                        entityRolloverBalance = entityRolloverBalance + toNum(entityFeature.rollovers[i].balance)
                    end
                end
                
                rollover.balance = toNum(rollover.balance) + entityRolloverBalance
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
                entityTotalBalance = entityTotalBalance + toNum(entityFeature.balance)
                entityTotalUsage = entityTotalUsage + toNum(entityFeature.usage)
                entityTotalIncludedUsage = entityTotalIncludedUsage + toNum(entityFeature.included_usage)
                entityTotalUsageLimit = entityTotalUsageLimit + toNum(entityFeature.usage_limit)
                
                -- Find minimum next_reset_at across all entities
                if type(entityFeature.next_reset_at) == "number" then
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

