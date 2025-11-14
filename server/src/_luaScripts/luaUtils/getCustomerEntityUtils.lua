-- ============================================================================
-- GET CUSTOMER/ENTITY UTILITY FUNCTIONS
-- ============================================================================

-- Get customer object with merged balances and subscriptions
-- Parameters:
--   orgId: Organization ID
--   env: Environment
--   customerId: Customer ID
--   skipEntityMerge: If true, only load customer's own balances (no entity merging)
-- Returns: customer object table (not JSON encoded), or nil if not found
local function getCustomerObject(orgId, env, customerId, skipEntityMerge)
    -- Build versioned cache key using shared utility
    local cacheKey = buildCustomerCacheKey(orgId, env, customerId)
    
    -- Load balances based on merge mode
    -- If skipEntityMerge is true, only load customer's own balances (no entity merging)
    -- If skipEntityMerge is false, load merged balances (customer + entities)
    local balances
    if skipEntityMerge then
        -- Load only customer's own balances without entity merging
        balances = loadBalances(cacheKey, orgId, env, customerId, "__CUSTOMER_ONLY__")
    else
        -- Load merged balances (customer + entities)
        balances = loadBalances(cacheKey, orgId, env, customerId)
    end
    
    if not balances then
        return nil -- Customer not in cache or partial eviction detected
    end
    
    -- Get base customer JSON for subscriptions and metadata
    local baseJson = redis.call("GET", cacheKey)
    if not baseJson then
        return nil
    end
    
    local baseCustomer = cjson.decode(baseJson)
    local entityIds = baseCustomer._entityIds or {}
    
    -- ============================================================================
    -- MERGE ENTITY SUBSCRIPTIONS INTO CUSTOMER SUBSCRIPTIONS
    -- ============================================================================
    
    -- Build entity base data map for subscription access
    local entityBaseData = {}
    for _, entityId in ipairs(entityIds) do
        local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
        local entityBaseJson = redis.call("GET", entityCacheKey)
        
        if entityBaseJson then
            entityBaseData[entityId] = cjson.decode(entityBaseJson)
        end
    end
    
    -- Collect all subscriptions: start with customer's subscriptions, then add all entity subscriptions
    local allSubscriptions = {}
    if baseCustomer.subscriptions then
        for _, subscription in ipairs(baseCustomer.subscriptions) do
            table.insert(allSubscriptions, subscription)
        end
    end
    
    -- Add subscriptions from each entity
    for _, entityId in ipairs(entityIds) do
        local entityBase = entityBaseData[entityId]
        if entityBase and entityBase.subscriptions then
            for _, subscription in ipairs(entityBase.subscriptions) do
                table.insert(allSubscriptions, subscription)
            end
        end
    end
    
    -- Merge subscriptions by plan ID and normalized status
    baseCustomer.subscriptions = mergeSubscriptions(allSubscriptions)
    
    -- Build final customer object
    baseCustomer._balanceFeatureIds = nil -- Remove tracking field
    baseCustomer._entityIds = nil -- Remove tracking field
    baseCustomer.balances = balances
    
    return baseCustomer
end

-- Get entity object with merged balances and subscriptions
-- Parameters:
--   orgId: Organization ID
--   env: Environment
--   customerId: Customer ID
--   entityId: Entity ID
--   skipCustomerMerge: If true, only load entity's own balances (no customer merging)
-- Returns: entity object table (not JSON encoded), or nil if not found
local function getEntityObject(orgId, env, customerId, entityId, skipCustomerMerge)
    -- Build versioned entity cache key using shared utility
    local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
    
    -- Get base entity JSON
    local baseJson = redis.call("GET", entityCacheKey)
    if not baseJson then
        return nil
    end
    
    local baseEntity = cjson.decode(baseJson)
    
    -- Build customer cache key for balance loading
    local customerCacheKey = buildCustomerCacheKey(orgId, env, customerId)
    
    -- ============================================================================
    -- LOAD BALANCES USING loadBalances
    -- ============================================================================
    local mergedBalances
    
    if skipCustomerMerge then
        -- Load only entity's own balances (no customer merging)
        -- We'll use loadBalances with "__CUSTOMER_ONLY__" mode on the entity cache key
        -- This is a bit of a hack but works with the current structure
        mergedBalances = loadBalances(entityCacheKey, orgId, env, customerId, "__CUSTOMER_ONLY__")
    else
        -- Load entity-level merged balances (entity + customer)
        -- loadBalances handles this when entityId is provided
        mergedBalances = loadBalances(customerCacheKey, orgId, env, customerId, entityId)
    end
    
    -- If balances loading failed (partial eviction), return nil
    if not mergedBalances then
        return nil
    end
    
    -- ============================================================================
    -- MERGE CUSTOMER SUBSCRIPTIONS INTO ENTITY SUBSCRIPTIONS
    -- Skip if skipCustomerMerge is true
    -- ============================================================================
    
    -- Get entity subscriptions (start with entity's own subscriptions)
    local entitySubscriptions = baseEntity.subscriptions or {}
    
    if not skipCustomerMerge then
        -- Get customer subscriptions
        local customerSubscriptions = nil
        local customerBaseJson = redis.call("GET", customerCacheKey)
        if customerBaseJson then
            local customerBase = cjson.decode(customerBaseJson)
            customerSubscriptions = customerBase.subscriptions
        end
        
        -- Merge customer subscriptions into entity subscriptions (only add if not exists)
        baseEntity.subscriptions = mergeCustomerSubscriptionsIntoEntity(entitySubscriptions, customerSubscriptions)
    else
        -- No merging - just use entity's own subscriptions
        baseEntity.subscriptions = entitySubscriptions
    end
    
    -- Build final entity object
    baseEntity._balanceFeatureIds = nil -- Remove tracking field
    baseEntity.balances = mergedBalances
    
    return baseEntity
end

