-- loadBalances.lua
-- Shared function to load customer balances with merged entity balances (customer + entities)
-- Returns: { [featureId] = { granted_balance, purchased_balance, current_balance, usage, ... } } or nil if not in cache

-- Helper function to safely convert values to numbers for arithmetic
local function toNum(value)
    return type(value) == "number" and value or 0
end

-- Helper function to parse HGETALL result into balance data object
local function parseBalanceHash(balanceHash)
    local balanceData = {}
    
    -- Define field types for parsing
    local numericFields = {
        granted_balance = true,
        purchased_balance = true,
        current_balance = true,
        usage = true,
        max_purchase = true,
        _breakdown_count = true,
        _rollover_count = true
    }
    
    local booleanFields = {
        unlimited = true,
        overage_allowed = true
    }
    
    local jsonFields = {
        feature = true,
        reset = true
    }
    
    for i = 1, #balanceHash, 2 do
        local key = balanceHash[i]
        local value = balanceHash[i + 1]
        
        -- Check for null first before parsing
        if value == "null" then
            balanceData[key] = cjson.null
        elseif numericFields[key] then
            balanceData[key] = tonumber(value)
        elseif booleanFields[key] then
            balanceData[key] = (value == "true")
        elseif jsonFields[key] then
            -- Parse JSON fields (feature object and reset object)
            if value ~= "null" and value ~= "" then
                balanceData[key] = cjson.decode(value)
            else
                balanceData[key] = cjson.null
            end
        else
            balanceData[key] = value
        end
    end
    return balanceData
end


-- Helper function to fetch and parse rollover items
-- Returns: array of rollover data objects, or nil if any key is missing (partial eviction)
-- cacheKey: base cache key (customer or entity cache key)
-- featureId: feature ID
-- rolloverCount: number of rollover items to fetch
local function fetchRollovers(cacheKey, featureId, rolloverCount)
    local rollovers = {}
    for i = 0, rolloverCount - 1 do
        local rolloverKey = buildRolloverCacheKey(cacheKey, featureId, i)
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
-- cacheKey: base cache key (customer or entity cache key)
-- featureId: feature ID
-- breakdownCount: number of breakdown items to fetch
local function fetchBreakdown(cacheKey, featureId, breakdownCount)
    local breakdown = {}
    
    -- Define field types for parsing breakdown items
    local breakdownNumericFields = {
        granted_balance = true,
        purchased_balance = true,
        current_balance = true,
        usage = true,
        max_purchase = true
    }
    
    local breakdownBooleanFields = {
        overage_allowed = true
    }
    
    local breakdownJsonFields = {
        reset = true
    }
    
    local breakdownStringFields = {
        plan_id = true
    }
    
    for i = 0, breakdownCount - 1 do
        local breakdownKey = buildBreakdownCacheKey(cacheKey, featureId, i)
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
            elseif breakdownNumericFields[key] then
                breakdownData[key] = tonumber(value)
            elseif breakdownBooleanFields[key] then
                breakdownData[key] = (value == "true")
            elseif breakdownJsonFields[key] then
                -- Parse reset JSON object
                if value ~= "null" and value ~= "" then
                    breakdownData[key] = cjson.decode(value)
                else
                    breakdownData[key] = cjson.null
                end
            elseif breakdownStringFields[key] then
                -- Handle string fields (like plan_id)
                if value == "null" then
                    breakdownData[key] = cjson.null
                else
                    breakdownData[key] = value
                end
            else
                breakdownData[key] = value
            end
        end
        table.insert(breakdown, breakdownData)
    end
    return breakdown
end

-- ============================================================================
-- MERGE BALANCE UTILITIES
-- ============================================================================

-- Helper function to merge numeric balance fields (sums values)
-- Mutates target by adding source's numeric fields
local function mergeBalanceNumericFields(target, source)
    target.granted_balance = toNum(target.granted_balance) + toNum(source.granted_balance)
    target.purchased_balance = toNum(target.purchased_balance) + toNum(source.purchased_balance)
    target.current_balance = toNum(target.current_balance) + toNum(source.current_balance)
    target.usage = toNum(target.usage) + toNum(source.usage)
    target.max_purchase = toNum(target.max_purchase or 0) + toNum(source.max_purchase or 0)
end

-- Helper function to merge overage_allowed (true if at least one is true)
-- Mutates target
local function mergeBalanceOverageAllowed(target, source)
    if source.overage_allowed == true then
        target.overage_allowed = true
    end
end

-- Helper function to merge reset objects (uses minimum resets_at)
-- Mutates target
local function mergeBalanceReset(target, source)
    if source.reset and source.reset ~= cjson.null and type(source.reset) == "table" and source.reset.resets_at then
        local sourceResetsAt = source.reset.resets_at
        if type(sourceResetsAt) == "number" then
            if target.reset and target.reset ~= cjson.null and type(target.reset) == "table" and target.reset.resets_at then
                local targetResetsAt = target.reset.resets_at
                if type(targetResetsAt) == "number" then
                    if sourceResetsAt < targetResetsAt then
                        target.reset.resets_at = sourceResetsAt
                    end
                else
                    target.reset.resets_at = sourceResetsAt
                end
            else
                -- Initialize reset object if it doesn't exist
                target.reset = {
                    interval = source.reset.interval,
                    interval_count = source.reset.interval_count,
                    resets_at = sourceResetsAt
                }
            end
        end
    end
end

-- Helper function to generate breakdown item key for matching
-- Key format: "interval_count:interval:overage_allowed"
-- Example: "1:month:true" or "1:month:false"
local function getBreakdownItemKey(breakdownItem)
    if not breakdownItem then
        return nil
    end
    
    local intervalCount = 1
    local interval = "none"
    
    -- Extract interval and interval_count from reset object
    if breakdownItem.reset and breakdownItem.reset ~= cjson.null and type(breakdownItem.reset) == "table" then
        interval = breakdownItem.reset.interval or "none"
        intervalCount = breakdownItem.reset.interval_count or 1
    end
    
    -- Get overage_allowed (usage model)
    local overageAllowed = breakdownItem.overage_allowed or false
    
    -- Return key in format: "interval_count:interval:overage_allowed"
    return tostring(intervalCount) .. ":" .. interval .. ":" .. tostring(overageAllowed)
end

-- Helper function to merge source balance into target balance
-- Mutates targetBalance by adding sourceBalance's balances, usage, breakdowns, and rollovers
-- Also handles minimum resets_at (earliest reset time) and overage_allowed (true if any is true)
local function mergeFeatureBalances(targetBalance, sourceBalance)
    if not sourceBalance then return end
    
    -- Merge top-level balance fields
    mergeBalanceNumericFields(targetBalance, sourceBalance)
    mergeBalanceOverageAllowed(targetBalance, sourceBalance)
    mergeBalanceReset(targetBalance, sourceBalance)
    
    -- Merge breakdown balances and usage
    -- Breakdown items are matched by key (interval_count:interval:overage_allowed)
    -- If a matching breakdown exists, merge it; otherwise, add as new breakdown item
    if sourceBalance.breakdown then
        for _, sourceBreakdown in ipairs(sourceBalance.breakdown) do
            local sourceKey = getBreakdownItemKey(sourceBreakdown)
            local foundMatch = false
            
            -- Try to find matching breakdown by key
            if targetBalance.breakdown then
                for _, targetBreakdown in ipairs(targetBalance.breakdown) do
                    local targetKey = getBreakdownItemKey(targetBreakdown)
                    if sourceKey and targetKey and sourceKey == targetKey then
                        -- Found matching breakdown - merge it
                        mergeBalanceNumericFields(targetBreakdown, sourceBreakdown)
                        mergeBalanceOverageAllowed(targetBreakdown, sourceBreakdown)
                        mergeBalanceReset(targetBreakdown, sourceBreakdown)
                        foundMatch = true
                        break
                    end
                end
            end
            
            -- If no matching breakdown found, add as new breakdown item
            if not foundMatch then
                if not targetBalance.breakdown then
                    targetBalance.breakdown = {}
                end
                -- Create a copy of the source breakdown to add
                local newBreakdown = {
                    granted_balance = sourceBreakdown.granted_balance,
                    purchased_balance = sourceBreakdown.purchased_balance,
                    current_balance = sourceBreakdown.current_balance,
                    usage = sourceBreakdown.usage,
                    max_purchase = sourceBreakdown.max_purchase,
                    overage_allowed = sourceBreakdown.overage_allowed,
                    reset = sourceBreakdown.reset
                }
                table.insert(targetBalance.breakdown, newBreakdown)
            end
        end
    end
    
    -- Merge rollover balances
    if sourceBalance.rollovers and #sourceBalance.rollovers > 0 then
        -- Both have rollovers, merge them
        if targetBalance.rollovers and #targetBalance.rollovers > 0 then
            for i, targetRollover in ipairs(targetBalance.rollovers) do
                local sourceRollover = sourceBalance.rollovers[i]
                if sourceRollover then
                    targetRollover.balance = toNum(targetRollover.balance) + toNum(sourceRollover.balance)
                end
            end
        end
    end
end

-- ============================================================================
-- LOAD SINGLE BALANCE (WITH _key FIELDS FOR REDIS OPERATIONS)
-- ============================================================================

-- Load a single balance from Redis cache (no merging)
-- Used by batchDeduction.lua for on-demand balance loading with Redis operation keys
-- Parameters:
--   cacheKey: Base cache key (customer or entity cache key)
--   featureId: Feature ID to load
-- Returns: balance object with _key fields for Redis operations, or nil if not found
local function loadBalance(cacheKey, featureId)
    local balanceKey = buildBalanceCacheKey(cacheKey, featureId)
    local balanceHash = redis.call("HGETALL", balanceKey)
    
    if #balanceHash == 0 then
        return nil
    end
    
    -- Parse balance hash using helper function
    local balanceData = parseBalanceHash(balanceHash)
    balanceData._key = balanceKey -- Add Redis key for operations
    
    -- Fetch rollovers using helper function
    local rolloverCount = balanceData._rollover_count or 0
    balanceData._rollover_count = nil
    
    local rollovers = fetchRollovers(cacheKey, featureId, rolloverCount)
    if rollovers == nil then
        return nil -- Partial eviction detected
    end
    
    -- Add _key fields to rollovers for Redis operations
    if #rollovers > 0 then
        for index, rollover in ipairs(rollovers) do
            rollover._key = buildRolloverCacheKey(cacheKey, featureId, index - 1)
            rollover._index = index - 1
        end
        balanceData.rollovers = rollovers
    end
    
    -- Fetch breakdown using helper function
    local breakdownCount = balanceData._breakdown_count or 0
    balanceData._breakdown_count = nil
    
    local breakdown = fetchBreakdown(cacheKey, featureId, breakdownCount)
    if breakdown == nil then
        return nil -- Partial eviction detected
    end
    
    -- Add _key fields to breakdown items for Redis operations
    if #breakdown > 0 then
        for index, breakdownItem in ipairs(breakdown) do
            breakdownItem._key = buildBreakdownCacheKey(cacheKey, featureId, index - 1)
            breakdownItem._index = index - 1
        end
        balanceData.breakdown = breakdown
    end
    
    return balanceData
end

-- ============================================================================
-- LOAD BALANCES WITH MERGING
-- ============================================================================

-- Load entity-level balances (entity + customer merged)
-- Used for entity-level sync mode
-- Parameters: cacheKey (customer cache key), orgId, env, customerId, entityId
-- Returns: merged balances table (entity + customer) or nil
local function loadEntityLevelFeatures(cacheKey, orgId, env, customerId, entityId)
    -- Build versioned entity cache key using shared utility
    local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
    
    -- Get entity base JSON
    local entityBaseJson = redis.call("GET", entityCacheKey)
    if not entityBaseJson then
        return nil
    end
    
    local entityBase = cjson.decode(entityBaseJson)
    local entityBalanceFeatureIds = entityBase._balanceFeatureIds or {}
    
    -- Load entity balances
    local entityBalances = {}
    for _, featureId in ipairs(entityBalanceFeatureIds) do
        local balanceKey = buildBalanceCacheKey(entityCacheKey, featureId)
        local balanceHash = redis.call("HGETALL", balanceKey)
        
        -- If balance key is missing, return nil (partial eviction detected)
        if #balanceHash == 0 then
            return nil
        end
        
        -- Parse balance hash using helper function
        local balanceData = parseBalanceHash(balanceHash)
        
        -- Fetch rollovers using helper function
        local rolloverCount = balanceData._rollover_count or 0
        balanceData._rollover_count = nil
        
        local rollovers = fetchRollovers(entityCacheKey, featureId, rolloverCount)
        if rollovers == nil then
            return nil -- Partial eviction detected
        end
        
        if #rollovers > 0 then
            balanceData.rollovers = rollovers
        end
        
        -- Fetch breakdown using helper function
        local breakdownCount = balanceData._breakdown_count or 0
        balanceData._breakdown_count = nil
        
        local breakdown = fetchBreakdown(entityCacheKey, featureId, breakdownCount)
        if breakdown == nil then
            return nil -- Partial eviction detected
        end
        
        if #breakdown > 0 then
            balanceData.breakdown = breakdown
        end
        
        entityBalances[featureId] = balanceData
    end
    
    -- Load customer balances (raw, no entity aggregation)
    local customerCacheKey = cacheKey
    local customerBaseJson = redis.call("GET", customerCacheKey)
    
    local customerBalances = {}
    if customerBaseJson then
        local customerBase = cjson.decode(customerBaseJson)
        local customerBalanceFeatureIds = customerBase._balanceFeatureIds or {}
        
        for _, featureId in ipairs(customerBalanceFeatureIds) do
            local balanceKey = buildBalanceCacheKey(customerCacheKey, featureId)
            local balanceHash = redis.call("HGETALL", balanceKey)
            
            if #balanceHash > 0 then
                -- Parse balance hash using helper function
                local balanceData = parseBalanceHash(balanceHash)
                
                -- Fetch rollovers
                local rolloverCount = balanceData._rollover_count or 0
                balanceData._rollover_count = nil
                local rollovers = fetchRollovers(customerCacheKey, featureId, rolloverCount) or {}
                if #rollovers > 0 then
                    balanceData.rollovers = rollovers
                end
                
                -- Fetch breakdown
                local breakdownCount = balanceData._breakdown_count or 0
                balanceData._breakdown_count = nil
                local breakdown = fetchBreakdown(customerCacheKey, featureId, breakdownCount) or {}
                if #breakdown > 0 then
                    balanceData.breakdown = breakdown
                end
                
                customerBalances[featureId] = balanceData
            end
        end
    end
    
    -- Merge customer and entity balances (entity + customer)
    local mergedBalances = {}
    
    -- First, add all customer balances (inherited)
    for featureId, customerBalance in pairs(customerBalances) do
        mergedBalances[featureId] = customerBalance
    end
    
    -- Then, merge or add entity balances
    for featureId, entityBalance in pairs(entityBalances) do
        local customerBalance = customerBalances[featureId]
        
        if customerBalance then
            -- Both customer and entity have this balance - merge balances
            if not entityBalance.unlimited and not customerBalance.unlimited then
                mergeFeatureBalances(entityBalance, customerBalance)
            end
            mergedBalances[featureId] = entityBalance
        else
            -- Only entity has this balance - use entity's balance
            mergedBalances[featureId] = entityBalance
        end
    end
    
    return mergedBalances
end

-- Load customer balances with merged entity balances
-- Parameters: cacheKey, orgId, env, customerId, entityId (optional)
-- If entityId is "__CUSTOMER_ONLY__": returns ONLY customer balances (no merging)
-- If entityId is provided (string): returns entity-level merged balances (entity + customer)
-- If entityId is nil: returns customer-level merged balances (customer + all entities)
-- Returns: merged balances table or nil
local function loadBalances(cacheKey, orgId, env, customerId, entityId)
    -- Special case: Customer-only mode (no entity merging)
    if entityId == "__CUSTOMER_ONLY__" then
        local baseJson = redis.call("GET", cacheKey)
        if not baseJson then
            return nil
        end
        
        local base = cjson.decode(baseJson)
        local balanceFeatureIds = base._balanceFeatureIds or {}
        
        -- Load only customer's own balances without entity merging
        local customerBalances = {}
        for _, featureId in ipairs(balanceFeatureIds) do
            local balanceKey = buildBalanceCacheKey(cacheKey, featureId)
            local balanceHash = redis.call("HGETALL", balanceKey)
            
            if #balanceHash == 0 then
                return nil -- Partial eviction detected
            end
            
            -- Parse balance hash
            local balanceData = parseBalanceHash(balanceHash)
            
            -- Fetch rollovers
            local rollovers = fetchRollovers(cacheKey, featureId, balanceData._rollover_count or 0)
            if rollovers == nil then
                return nil -- Partial eviction
            end
            if #rollovers > 0 then
                balanceData.rollovers = rollovers
            end
            
            -- Fetch breakdown
            local breakdown = fetchBreakdown(cacheKey, featureId, balanceData._breakdown_count or 0)
            if breakdown == nil then
                return nil -- Partial eviction
            end
            if #breakdown > 0 then
                balanceData.breakdown = breakdown
            end
            
            -- Remove metadata fields
            balanceData._breakdown_count = nil
            balanceData._rollover_count = nil
            
            customerBalances[featureId] = balanceData
        end
        
        return customerBalances
    end
    
    -- If entityId is provided, load entity-level balances (entity + customer merged)
    if entityId then
        return loadEntityLevelFeatures(cacheKey, orgId, env, customerId, entityId)
    end
    
    -- Otherwise, load customer-level balances (customer + all entities merged)
    -- Get base customer JSON
    local baseJson = redis.call("GET", cacheKey)
    if not baseJson then
        return nil
    end

    local baseCustomer = cjson.decode(baseJson)
    local balanceFeatureIds = baseCustomer._balanceFeatureIds or {}
    local entityIds = baseCustomer._entityIds or {}

    -- Build balances object
    local balances = {}

    for _, featureId in ipairs(balanceFeatureIds) do
        local balanceKey = buildBalanceCacheKey(cacheKey, featureId)
        local balanceHash = redis.call("HGETALL", balanceKey)
        
        -- If balance key is missing, return nil (partial eviction detected)
        if #balanceHash == 0 then
            return nil
        end
        
        -- Parse balance hash using helper function
        local balanceData = parseBalanceHash(balanceHash)
        
        -- Fetch rollovers using helper function
        local rolloverCount = balanceData._rollover_count or 0
        balanceData._rollover_count = nil -- Remove from final output
        
        local rollovers = fetchRollovers(cacheKey, featureId, rolloverCount)
        if rollovers == nil then
            return nil -- Partial eviction detected
        end
        
        if #rollovers > 0 then
            balanceData.rollovers = rollovers
        end
        
        -- Fetch breakdown using helper function
        local breakdownCount = balanceData._breakdown_count or 0
        balanceData._breakdown_count = nil -- Remove from final output
        
        local breakdown = fetchBreakdown(cacheKey, featureId, breakdownCount)
        if breakdown == nil then
            return nil -- Partial eviction detected
        end
        
        if #breakdown > 0 then
            balanceData.breakdown = breakdown
        end
        
        balances[featureId] = balanceData
    end

    -- ============================================================================
    -- FETCH AND MERGE ENTITY BALANCES
    -- ============================================================================

    -- Fetch all entity balances and aggregate balances
    local entityBalanceData = {} -- {[entityId][featureId] = balanceData}
    local entityBaseData = {} -- {[entityId] = entityBase} - Store entity base for product access

    for _, entityId in ipairs(entityIds) do
        local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
        local entityBaseJson = redis.call("GET", entityCacheKey)
        
        if entityBaseJson then
            local entityBase = cjson.decode(entityBaseJson)
            entityBaseData[entityId] = entityBase -- Store entity base for product access
            local entityBalanceFeatureIds = entityBase._balanceFeatureIds or {}
            entityBalanceData[entityId] = {}
            
            for _, featureId in ipairs(entityBalanceFeatureIds) do
                local balanceKey = buildBalanceCacheKey(entityCacheKey, featureId)
                local balanceHash = redis.call("HGETALL", balanceKey)
                
                if #balanceHash > 0 then
                    -- Parse entity balance using helper function
                    local entityBalance = parseBalanceHash(balanceHash)
                    
                    -- Fetch breakdown items for this entity balance using helper function
                    local breakdownCount = entityBalance._breakdown_count or 0
                    entityBalance._breakdown_count = nil
                    entityBalance.breakdown = fetchBreakdown(entityCacheKey, featureId, breakdownCount) or {}
                    
                    -- Fetch rollover items for this entity balance using helper function
                    local rolloverCount = entityBalance._rollover_count or 0
                    entityBalance._rollover_count = nil
                    entityBalance.rollovers = fetchRollovers(entityCacheKey, featureId, rolloverCount) or {}
                    
                    entityBalanceData[entityId][featureId] = entityBalance
                end
            end
        end
    end



    -- ============================================================================
    -- MERGE ENTITY BALANCES INTO CUSTOMER BALANCES
    -- ============================================================================

    for featureId, customerBalance in pairs(balances) do
        -- Skip if unlimited
        if not customerBalance.unlimited then
            -- Merge each entity's balances into customer balance
            for entityId, entityBalances in pairs(entityBalanceData) do
                local entityBalance = entityBalances[featureId]
                if entityBalance then
                    mergeFeatureBalances(customerBalance, entityBalance)
                end
            end
        end
    end

    -- Add entity-only balances (balances that exist in entities but not in customer)
    for entityId, entityBalances in pairs(entityBalanceData) do
        for featureId, entityBalance in pairs(entityBalances) do
            if not balances[featureId] then
                -- This balance doesn't exist in customer, add it with zero values
                balances[featureId] = {
                    feature_id = featureId,
                    feature = entityBalance.feature,
                    unlimited = entityBalance.unlimited,
                    granted_balance = 0,
                    purchased_balance = 0,
                    current_balance = 0,
                    usage = 0,
                    max_purchase = entityBalance.max_purchase or 0,
                    overage_allowed = entityBalance.overage_allowed,
                    reset = entityBalance.reset,
                    breakdown = {}
                }
            end
        end
    end

    -- Aggregate balances for entity-only balances using mergeFeatureBalances
    for featureId, customerBalance in pairs(balances) do
        -- Only process if this was an entity-only balance (all balances are still 0 from initialization)
        if customerBalance.granted_balance == 0 and customerBalance.purchased_balance == 0 and customerBalance.current_balance == 0 and customerBalance.usage == 0 then
            for entityId, entityBalances in pairs(entityBalanceData) do
                local entityBalance = entityBalances[featureId]
                if entityBalance then
                    mergeFeatureBalances(customerBalance, entityBalance)
                end
            end
        end
    end

    -- Clean up empty rollovers arrays before returning
    for featureId, balance in pairs(balances) do
        if balance.rollovers and #balance.rollovers == 0 then
            balance.rollovers = nil
        end
    end

-- Return merged balances
return balances
end