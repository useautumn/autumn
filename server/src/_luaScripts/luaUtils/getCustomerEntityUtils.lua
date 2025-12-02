-- ============================================================================
-- GET CUSTOMER/ENTITY UTILITY FUNCTIONS
-- ============================================================================

-- ============================================================================
-- LEGACY DATA MERGE UTILITIES
-- ============================================================================

-- Helper function to merge breakdown_legacy_data by key
-- Sums prepaid_quantity for matching keys, adds new items for non-matching keys
-- Mutates targetBreakdown by merging sourceBreakdown into it
local function mergeBreakdownLegacyData(targetBreakdown, sourceBreakdown)
    if not sourceBreakdown then return end
    if not targetBreakdown then return end
    
    for _, sourceItem in ipairs(sourceBreakdown) do
        local foundMatch = false
        
        -- Try to find matching item by key
        for _, targetItem in ipairs(targetBreakdown) do
            if sourceItem.key and targetItem.key and sourceItem.key == targetItem.key then
                -- Found match - sum prepaid_quantity
                targetItem.prepaid_quantity = (targetItem.prepaid_quantity or 0) + (sourceItem.prepaid_quantity or 0)
                foundMatch = true
                break
            end
        end
        
        -- If no match found, add as new item
        if not foundMatch then
            table.insert(targetBreakdown, {
                key = sourceItem.key,
                prepaid_quantity = sourceItem.prepaid_quantity or 0
            })
        end
    end
end

-- Helper function to create a virtual breakdown item from top-level legacy data
-- Used when legacy data has no breakdown_legacy_data array but needs to be merged
local function legacyDataToBreakdownItem(featureData)
    return {
        key = featureData.key or "",
        prepaid_quantity = featureData.prepaid_quantity or 0
    }
end

-- Helper function to merge cusProductLegacyData from source into target
-- Merges by plan_id: keeps subscription_id from either, merges options arrays
-- Mutates targetLegacyData
local function mergeCusProductLegacyData(targetLegacyData, sourceLegacyData)
    if not sourceLegacyData then return end
    if not targetLegacyData then return end
    
    local targetCusProduct = targetLegacyData.cusProductLegacyData
    local sourceCusProduct = sourceLegacyData.cusProductLegacyData
    
    if not sourceCusProduct then return end
    
    -- Initialize target cusProductLegacyData if nil
    if not targetCusProduct then
        targetLegacyData.cusProductLegacyData = {}
        targetCusProduct = targetLegacyData.cusProductLegacyData
    end
    
    -- Merge each plan_id from source into target
    for planId, sourceProductData in pairs(sourceCusProduct) do
        local targetProductData = targetCusProduct[planId]
        
        if targetProductData then
            -- Plan exists in target - merge values
            -- subscription_id: keep target's if exists, otherwise use source's
            if not targetProductData.subscription_id or targetProductData.subscription_id == cjson.null then
                targetProductData.subscription_id = sourceProductData.subscription_id
            end
            
            -- options: merge by feature_id (add source options that don't exist in target)
            if sourceProductData.options and #sourceProductData.options > 0 then
                if not targetProductData.options then
                    targetProductData.options = {}
                end
                
                -- Build set of existing feature_ids in target options
                local existingFeatureIds = {}
                for _, option in ipairs(targetProductData.options) do
                    if option.feature_id then
                        existingFeatureIds[option.feature_id] = true
                    end
                end
                
                -- Add source options that don't exist in target
                for _, sourceOption in ipairs(sourceProductData.options) do
                    if sourceOption.feature_id and not existingFeatureIds[sourceOption.feature_id] then
                        table.insert(targetProductData.options, sourceOption)
                    end
                end
            end
        else
            -- Plan doesn't exist in target - add it (deep copy)
            local newProductData = {
                subscription_id = sourceProductData.subscription_id,
                options = {}
            }
            if sourceProductData.options then
                for _, option in ipairs(sourceProductData.options) do
                    table.insert(newProductData.options, option)
                end
            end
            targetCusProduct[planId] = newProductData
        end
    end
end

-- Helper function to merge cusFeatureLegacyData from source into target
-- Merges by feature_id: sums prepaid_quantity, merges breakdown_legacy_data by key
-- Similar to balance breakdown merging:
-- - Each legacy data without breakdown_legacy_data is treated as a single "virtual" breakdown item
-- - Breakdown items are matched by key
-- - If keys match: sum prepaid_quantity
-- - If keys differ: create separate breakdown items
-- Mutates targetLegacyData
local function mergeCusFeatureLegacyData(targetLegacyData, sourceLegacyData)
    if not sourceLegacyData then return end
    if not targetLegacyData then return end
    
    local targetCusFeature = targetLegacyData.cusFeatureLegacyData
    local sourceCusFeature = sourceLegacyData.cusFeatureLegacyData
    
    if not sourceCusFeature then return end
    
    -- Initialize target cusFeatureLegacyData if nil
    if not targetCusFeature then
        targetLegacyData.cusFeatureLegacyData = {}
        targetCusFeature = targetLegacyData.cusFeatureLegacyData
    end
    
    -- Merge each feature_id from source into target
    for featureId, sourceFeatureData in pairs(sourceCusFeature) do
        local targetFeatureData = targetCusFeature[featureId]
        
        if targetFeatureData then
            -- Feature exists in target - merge values
            
            -- ============================================================================
            -- CAPTURE VIRTUAL BREAKDOWN ITEMS BEFORE MUTATING TOP-LEVEL FIELDS
            -- ============================================================================
            -- Similar to balance merging: capture breakdown items BEFORE summing
            
            -- Get effective breakdown from target
            local targetBreakdowns = targetFeatureData.breakdown_legacy_data
            local targetHadBreakdown = targetBreakdowns and #targetBreakdowns > 0
            
            if not targetHadBreakdown then
                -- Target has no breakdown - create virtual item from top-level fields
                targetBreakdowns = { legacyDataToBreakdownItem(targetFeatureData) }
            end
            
            -- Get effective breakdown from source
            local sourceBreakdowns = sourceFeatureData.breakdown_legacy_data
            if not sourceBreakdowns or #sourceBreakdowns == 0 then
                -- Source has no breakdown - create virtual item from top-level fields
                sourceBreakdowns = { legacyDataToBreakdownItem(sourceFeatureData) }
            end
            
            -- ============================================================================
            -- NOW MERGE TOP-LEVEL PREPAID_QUANTITY
            -- ============================================================================
            targetFeatureData.prepaid_quantity = (targetFeatureData.prepaid_quantity or 0) + (sourceFeatureData.prepaid_quantity or 0)
            
            -- ============================================================================
            -- MERGE BREAKDOWN ITEMS BY KEY
            -- ============================================================================
            for _, sourceItem in ipairs(sourceBreakdowns) do
                local foundMatch = false
                
                for _, targetItem in ipairs(targetBreakdowns) do
                    if sourceItem.key and targetItem.key and sourceItem.key == targetItem.key then
                        -- Found match - sum prepaid_quantity
                        targetItem.prepaid_quantity = (targetItem.prepaid_quantity or 0) + (sourceItem.prepaid_quantity or 0)
                        foundMatch = true
                        break
                    end
                end
                
                -- If no match found, add as new item
                if not foundMatch then
                    table.insert(targetBreakdowns, {
                        key = sourceItem.key,
                        prepaid_quantity = sourceItem.prepaid_quantity or 0
                    })
                end
            end
            
            -- Set breakdown_legacy_data if we have multiple items or originally had breakdown
            if #targetBreakdowns > 1 or targetHadBreakdown then
                targetFeatureData.breakdown_legacy_data = targetBreakdowns
                -- Clear top-level key since it's now in breakdown items
                targetFeatureData.key = nil
            end
        else
            -- Feature doesn't exist in target - add it (deep copy)
            local newFeatureData = {
                key = sourceFeatureData.key,
                prepaid_quantity = sourceFeatureData.prepaid_quantity or 0,
                breakdown_legacy_data = {}
            }
            if sourceFeatureData.breakdown_legacy_data and #sourceFeatureData.breakdown_legacy_data > 0 then
                for _, item in ipairs(sourceFeatureData.breakdown_legacy_data) do
                    table.insert(newFeatureData.breakdown_legacy_data, {
                        key = item.key,
                        prepaid_quantity = item.prepaid_quantity or 0
                    })
                end
            end
            targetCusFeature[featureId] = newFeatureData
        end
    end
end

-- ============================================================================
-- CUSTOMER/ENTITY RETRIEVAL FUNCTIONS
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
    
    -- Collect all scheduled_subscriptions: start with customer's scheduled_subscriptions, then add all entity scheduled_subscriptions
    local allScheduledSubscriptions = {}
    if baseCustomer.scheduled_subscriptions then
        for _, subscription in ipairs(baseCustomer.scheduled_subscriptions) do
            table.insert(allScheduledSubscriptions, subscription)
        end
    end
    
    -- Add scheduled_subscriptions from each entity
    for _, entityId in ipairs(entityIds) do
        local entityBase = entityBaseData[entityId]
        if entityBase and entityBase.scheduled_subscriptions then
            for _, subscription in ipairs(entityBase.scheduled_subscriptions) do
                table.insert(allScheduledSubscriptions, subscription)
            end
        end
    end
    
    -- Merge scheduled_subscriptions by plan ID and normalized status
    baseCustomer.scheduled_subscriptions = mergeSubscriptions(allScheduledSubscriptions)

    -- ============================================================================
    -- MERGE ENTITY LEGACY DATA INTO CUSTOMER LEGACY DATA
    -- ============================================================================
    
    if not skipEntityMerge and baseCustomer.legacyData then
        for _, entityId in ipairs(entityIds) do
            local entityBase = entityBaseData[entityId]
            if entityBase and entityBase.legacyData then
                mergeCusFeatureLegacyData(baseCustomer.legacyData, entityBase.legacyData)
                mergeCusProductLegacyData(baseCustomer.legacyData, entityBase.legacyData)
            end
        end
    end

    -- Merge invoices
    -- Build final customer object
    baseCustomer.invoices = baseCustomer.invoices or nil
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
    local entityScheduledSubscriptions = baseEntity.scheduled_subscriptions or {}
    
    if not skipCustomerMerge then
        -- Get customer base data for subscriptions and legacy data
        local customerBase = nil
        local customerBaseJson = redis.call("GET", customerCacheKey)
        if customerBaseJson then
            customerBase = cjson.decode(customerBaseJson)
        end
        
        -- Merge customer subscriptions into entity subscriptions (only add if not exists)
        local customerSubscriptions = customerBase and customerBase.subscriptions or nil
        local customerScheduledSubscriptions = customerBase and customerBase.scheduled_subscriptions or nil
        baseEntity.subscriptions = mergeCustomerSubscriptionsIntoEntity(entitySubscriptions, customerSubscriptions)
        baseEntity.scheduled_subscriptions = mergeCustomerSubscriptionsIntoEntity(entityScheduledSubscriptions, customerScheduledSubscriptions)
        
        -- ============================================================================
        -- MERGE CUSTOMER LEGACY DATA INTO ENTITY LEGACY DATA
        -- ============================================================================
        if baseEntity.legacyData and customerBase and customerBase.legacyData then
            mergeCusFeatureLegacyData(baseEntity.legacyData, customerBase.legacyData)
            mergeCusProductLegacyData(baseEntity.legacyData, customerBase.legacyData)
        end
    else
        -- No merging - just use entity's own subscriptions
        baseEntity.subscriptions = entitySubscriptions
        baseEntity.scheduled_subscriptions = entityScheduledSubscriptions
    end
    
    -- Build final entity object
    baseEntity._balanceFeatureIds = nil -- Remove tracking field
    baseEntity.balances = mergedBalances
    
    return baseEntity
end

