-- loadCusFeatures.lua
-- Shared function to load customer features with merged balances (customer + entities)
-- Returns: { [featureId] = { balance, usage, unlimited, ... } } or nil if not in cache

-- Helper function to safely convert values to numbers for arithmetic
local function toNum(value)
    return type(value) == "number" and value or 0
end

-- Helper function to parse HGETALL result into feature data object
local function parseFeatureHash(featureHash)
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
    return featureData
end


-- Helper function to fetch and parse rollover items
-- Returns: array of rollover data objects, or nil if any key is missing (partial eviction)
local function fetchRollovers(baseKey, rolloverCount)
    local rollovers = {}
    for i = 0, rolloverCount - 1 do
        local rolloverKey = baseKey .. ":rollover:" .. i
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
    return rollovers
end

-- Helper function to fetch and parse breakdown items
-- Returns: array of breakdown data objects, or nil if any key is missing (partial eviction)
local function fetchBreakdown(baseKey, breakdownCount)
    local breakdown = {}
    for i = 0, breakdownCount - 1 do
        local breakdownKey = baseKey .. ":breakdown:" .. i
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
    return breakdown
end

-- Helper function to merge source feature balances into target feature
-- Mutates targetFeature by adding sourceFeature's balances, usage, breakdowns, and rollovers
-- Also handles minimum next_reset_at (earliest reset time)
local function mergeFeatureBalances(targetFeature, sourceFeature)
    if not sourceFeature then return end
    
    -- Merge top-level balance and usage
    targetFeature.balance = toNum(targetFeature.balance) + toNum(sourceFeature.balance)
    targetFeature.usage = toNum(targetFeature.usage) + toNum(sourceFeature.usage)
    targetFeature.included_usage = toNum(targetFeature.included_usage) + toNum(sourceFeature.included_usage)
    targetFeature.usage_limit = toNum(targetFeature.usage_limit) + toNum(sourceFeature.usage_limit)
    
    -- Use minimum next_reset_at (earliest reset time)
    if type(sourceFeature.next_reset_at) == "number" then
        if type(targetFeature.next_reset_at) == "number" then
            if sourceFeature.next_reset_at < targetFeature.next_reset_at then
                targetFeature.next_reset_at = sourceFeature.next_reset_at
            end
        else
            targetFeature.next_reset_at = sourceFeature.next_reset_at
        end
    end
    
    -- Merge breakdown balances and usage
    if targetFeature.breakdown and sourceFeature.breakdowns then
        for i, targetBreakdown in ipairs(targetFeature.breakdown) do
            local sourceBreakdown = sourceFeature.breakdowns[i]
            if sourceBreakdown then
                targetBreakdown.balance = toNum(targetBreakdown.balance) + toNum(sourceBreakdown.balance)
                targetBreakdown.usage = toNum(targetBreakdown.usage) + toNum(sourceBreakdown.usage)
                targetBreakdown.included_usage = toNum(targetBreakdown.included_usage) + toNum(sourceBreakdown.included_usage)
                targetBreakdown.usage_limit = toNum(targetBreakdown.usage_limit) + toNum(sourceBreakdown.usage_limit)
                
                -- Use minimum next_reset_at for breakdown
                if type(sourceBreakdown.next_reset_at) == "number" then
                    if type(targetBreakdown.next_reset_at) == "number" then
                        if sourceBreakdown.next_reset_at < targetBreakdown.next_reset_at then
                            targetBreakdown.next_reset_at = sourceBreakdown.next_reset_at
                        end
                    else
                        targetBreakdown.next_reset_at = sourceBreakdown.next_reset_at
                    end
                end
            end
        end
    end
    
    -- Merge rollover balances
    if targetFeature.rollovers and sourceFeature.rollovers then
        for i, targetRollover in ipairs(targetFeature.rollovers) do
            local sourceRollover = sourceFeature.rollovers[i]
            if sourceRollover then
                targetRollover.balance = toNum(targetRollover.balance) + toNum(sourceRollover.balance)
            end
        end
    end
end

-- Load entity-level features (entity + customer merged)
-- Used for entity-level sync mode
-- Parameters: cacheKey (customer cache key), orgId, env, customerId, entityId
-- Returns: merged features table (entity + customer) or nil
local function loadEntityLevelFeatures(cacheKey, orgId, env, customerId, entityId)
    -- Build entity cache key
    local entityCacheKey = "{" .. orgId .. "}:" .. env .. ":customer:" .. customerId .. ":entity:" .. entityId
    
    -- Get entity base JSON
    local entityBaseJson = redis.call("GET", entityCacheKey)
    if not entityBaseJson then
        return nil
    end
    
    local entityBase = cjson.decode(entityBaseJson)
    local entityFeatureIds = entityBase._featureIds or {}
    
    -- Load entity features
    local entityFeatures = {}
    for _, featureId in ipairs(entityFeatureIds) do
        local featureKey = entityCacheKey .. ":features:" .. featureId
        local featureHash = redis.call("HGETALL", featureKey)
        
        -- If feature key is missing, return nil (partial eviction detected)
        if #featureHash == 0 then
            return nil
        end
        
        -- Parse feature hash using helper function
        local featureData = parseFeatureHash(featureHash)
        
        -- Fetch rollovers using helper function
        local rolloverCount = featureData._rollover_count or 0
        featureData._rollover_count = nil
        
        local rollovers = fetchRollovers(featureKey, rolloverCount)
        if rollovers == nil then
            return nil -- Partial eviction detected
        end
        
        if #rollovers > 0 then
            featureData.rollovers = rollovers
        end
        
        -- Fetch breakdown using helper function
        local breakdownCount = featureData._breakdown_count or 0
        featureData._breakdown_count = nil
        
        local breakdown = fetchBreakdown(featureKey, breakdownCount)
        if breakdown == nil then
            return nil -- Partial eviction detected
        end
        
        if #breakdown > 0 then
            featureData.breakdown = breakdown
        end
        
        entityFeatures[featureId] = featureData
    end
    
    -- Load customer features (raw, no entity aggregation)
    local customerCacheKey = cacheKey
    local customerBaseJson = redis.call("GET", customerCacheKey)
    
    local customerFeatures = {}
    if customerBaseJson then
        local customerBase = cjson.decode(customerBaseJson)
        local customerFeatureIds = customerBase._featureIds or {}
        
        for _, featureId in ipairs(customerFeatureIds) do
            local featureKey = customerCacheKey .. ":features:" .. featureId
            local featureHash = redis.call("HGETALL", featureKey)
            
            if #featureHash > 0 then
                -- Parse feature hash using helper function
                local featureData = parseFeatureHash(featureHash)
                
                -- Fetch rollovers
                local rolloverCount = featureData._rollover_count or 0
                featureData._rollover_count = nil
                local rollovers = fetchRollovers(featureKey, rolloverCount) or {}
                if #rollovers > 0 then
                    featureData.rollovers = rollovers
                end
                
                -- Fetch breakdown
                local breakdownCount = featureData._breakdown_count or 0
                featureData._breakdown_count = nil
                local breakdown = fetchBreakdown(featureKey, breakdownCount) or {}
                if #breakdown > 0 then
                    featureData.breakdown = breakdown
                end
                
                customerFeatures[featureId] = featureData
            end
        end
    end
    
    -- Merge customer and entity features (entity + customer)
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
                mergeFeatureBalances(entityFeature, customerFeature)
            end
            mergedFeatures[featureId] = entityFeature
        else
            -- Only entity has this feature - use entity's feature
            mergedFeatures[featureId] = entityFeature
        end
    end
    
    return mergedFeatures
end

-- Load customer features with merged entity balances
-- Parameters: cacheKey, orgId, env, customerId, entityId (optional)
-- If entityId is "__CUSTOMER_ONLY__": returns ONLY customer features (no merging)
-- If entityId is provided (string): returns entity-level merged features (entity + customer)
-- If entityId is nil: returns customer-level merged features (customer + all entities)
-- Returns: merged features table or nil
local function loadCusFeatures(cacheKey, orgId, env, customerId, entityId)
    -- Special case: Customer-only mode (no entity merging)
    if entityId == "__CUSTOMER_ONLY__" then
        local baseJson = redis.call("GET", cacheKey)
        if not baseJson then
            return nil
        end
        
        local base = cjson.decode(baseJson)
        local featureIds = base._featureIds or {}
        
        -- Load only customer's own features without entity merging
        local customerFeatures = {}
        for _, featureId in ipairs(featureIds) do
            local featureKey = cacheKey .. ":features:" .. featureId
            local featureHash = redis.call("HGETALL", featureKey)
            
            if #featureHash == 0 then
                return nil -- Partial eviction detected
            end
            
            -- Parse feature hash
            local featureData = parseFeatureHash(featureHash)
            featureData.id = featureId
            
            -- Fetch rollovers
            local rollovers = fetchRollovers(featureKey, featureData._rollover_count or 0)
            if rollovers == nil then
                return nil -- Partial eviction
            end
            if #rollovers > 0 then
                featureData.rollovers = rollovers
            end
            
            -- Fetch breakdown
            local breakdown = fetchBreakdown(featureKey, featureData._breakdown_count or 0)
            if breakdown == nil then
                return nil -- Partial eviction
            end
            if #breakdown > 0 then
                featureData.breakdown = breakdown
            end
            
            -- Remove metadata fields
            featureData._breakdown_count = nil
            featureData._rollover_count = nil
            
            customerFeatures[featureId] = featureData
        end
        
        return customerFeatures
    end
    
    -- If entityId is provided, load entity-level features (entity + customer merged)
    if entityId then
        return loadEntityLevelFeatures(cacheKey, orgId, env, customerId, entityId)
    end
    
    -- Otherwise, load customer-level features (customer + all entities merged)
    -- Get base customer JSON
    local baseJson = redis.call("GET", cacheKey)
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
        
        -- Parse feature hash using helper function
        local featureData = parseFeatureHash(featureHash)
        
        -- Fetch rollovers using helper function
        local rolloverCount = featureData._rollover_count or 0
        featureData._rollover_count = nil -- Remove from final output
        
        local rollovers = fetchRollovers(featureKey, rolloverCount)
        if rollovers == nil then
            return nil -- Partial eviction detected
        end
        
        if #rollovers > 0 then
            featureData.rollovers = rollovers
        end
        
        -- Fetch breakdown using helper function
        local breakdownCount = featureData._breakdown_count or 0
        featureData._breakdown_count = nil -- Remove from final output
        
        local breakdown = fetchBreakdown(featureKey, breakdownCount)
        if breakdown == nil then
            return nil -- Partial eviction detected
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
                    -- Parse entity feature using helper function
                    local entityFeature = parseFeatureHash(entityFeatureHash)
                    
                    -- Fetch breakdown items for this entity feature using helper function
                    local breakdownCount = entityFeature._breakdown_count or 0
                    entityFeature._breakdown_count = nil
                    entityFeature.breakdowns = fetchBreakdown(entityFeatureKey, breakdownCount) or {}
                    
                    -- Fetch rollover items for this entity feature using helper function
                    local rolloverCount = entityFeature._rollover_count or 0
                    entityFeature._rollover_count = nil
                    entityFeature.rollovers = fetchRollovers(entityFeatureKey, rolloverCount) or {}
                    
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
            -- Merge each entity's feature balances into customer feature
            for entityId, entityFeatures in pairs(entityFeatureData) do
                local entityFeature = entityFeatures[featureId]
                if entityFeature then
                    mergeFeatureBalances(customerFeature, entityFeature)
                end
            end
        end
    end

    -- Add entity-only features (features that exist in entities but not in customer)
    for entityId, entityFeatures in pairs(entityFeatureData) do
        for featureId, entityFeature in pairs(entityFeatures) do
            if not features[featureId] then
                -- This feature doesn't exist in customer, add it with zero values
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
                    usage_limit = 0,
                    credit_schema = entityFeature.credit_schema
                }
            end
        end
    end

    -- Aggregate balances for entity-only features using mergeFeatureBalances
    for featureId, customerFeature in pairs(features) do
        -- Only process if this was an entity-only feature (balance is still 0 from initialization)
        if customerFeature.balance == 0 and customerFeature.usage == 0 then
            for entityId, entityFeatures in pairs(entityFeatureData) do
                local entityFeature = entityFeatures[featureId]
                if entityFeature then
                    mergeFeatureBalances(customerFeature, entityFeature)
                end
            end
        end
    end

-- Return merged features
return features
end