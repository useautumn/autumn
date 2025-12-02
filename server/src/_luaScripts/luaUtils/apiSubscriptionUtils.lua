-- apiSubscriptionUtils.lua
-- Shared utility functions for subscription merging and manipulation

-- Helper function to get subscription key for grouping (plan_id:normalized_status)
-- Normalizes status: "active" or past_due=true -> "active", otherwise uses actual status
local function getSubscriptionKey(subscription)
    local status = subscription.status
    -- Normalize status: "active" or past_due=true -> "active", otherwise use actual status
    if status == "active" or (subscription.past_due == true) then
        status = "active"
    end
    return subscription.plan_id .. ":" .. status
end

-- Helper function to check if a plan has features
local function planHasFeatures(plan)
    if not plan or plan == cjson.null then
        return false
    end
    if not plan.features or plan.features == cjson.null then
        return false
    end
    if type(plan.features) == "table" and #plan.features > 0 then
        return true
    end
    return false
end

-- Helper function to merge subscriptions array by plan ID and normalized status
-- Groups subscriptions by key (plan_id:normalized_status) and merges quantities
-- Used by getCustomer.lua to merge customer + entity subscriptions
-- Parameters: subscriptionsArray - array of subscriptions to merge
-- Returns: array of merged subscriptions
local function mergeSubscriptions(subscriptionsArray)
    if not subscriptionsArray or #subscriptionsArray == 0 then
        return {}
    end
    
    local record = {}
    
    for _, curr in ipairs(subscriptionsArray) do
        local key = getSubscriptionKey(curr)
        local latest = record[key]
        
        local currStartedAt = curr.started_at
        
        -- Start with latest (or current if no latest exists), then override specific fields
        local mergedSubscription = {}
        if latest then
            -- Copy all fields from latest first
            for k, v in pairs(latest) do
                mergedSubscription[k] = v
            end
        else
            -- Copy all fields from current
            for k, v in pairs(curr) do
                mergedSubscription[k] = v
            end
        end
        
        -- Apply merge logic for specific fields
        if latest then
            -- canceled_at: current.canceled_at if exists, else latest.canceled_at, else null
            if curr.canceled_at and curr.canceled_at ~= cjson.null and curr.canceled_at ~= nil then
                mergedSubscription.canceled_at = curr.canceled_at
            elseif latest.canceled_at and latest.canceled_at ~= cjson.null and latest.canceled_at ~= nil then
                mergedSubscription.canceled_at = latest.canceled_at
            else
                mergedSubscription.canceled_at = cjson.null
            end
            
            -- started_at: latest.started_at ? min(latest.started_at, current.started_at) : current.started_at
            if latest.started_at then
                mergedSubscription.started_at = math.min(latest.started_at, currStartedAt)
            else
                mergedSubscription.started_at = currStartedAt
            end
            
            -- quantity: (latest.quantity or 0) + (current.quantity or 0)
            local latestQuantity = latest.quantity or 0
            local currQuantity = curr.quantity or 0
            mergedSubscription.quantity = latestQuantity + currQuantity
            
            -- past_due: true if either is true
            mergedSubscription.past_due = (latest.past_due == true) or (curr.past_due == true)
            
            -- plan: prefer the plan with features
            local latestHasFeatures = planHasFeatures(latest.plan)
            local currHasFeatures = planHasFeatures(curr.plan)
            
            if currHasFeatures and not latestHasFeatures then
                mergedSubscription.plan = curr.plan
            elseif latestHasFeatures then
                mergedSubscription.plan = latest.plan
            elseif curr.plan and curr.plan ~= cjson.null then
                mergedSubscription.plan = curr.plan
            end
        else
            -- First subscription in group, ensure defaults
            mergedSubscription.canceled_at = curr.canceled_at or cjson.null
            mergedSubscription.started_at = currStartedAt
            mergedSubscription.quantity = curr.quantity or 0
            mergedSubscription.past_due = curr.past_due or false
        end
        
        record[key] = mergedSubscription
    end
    
    -- Convert record back to array
    local mergedSubscriptions = {}
    for _, subscription in pairs(record) do
        table.insert(mergedSubscriptions, subscription)
    end
    
    return mergedSubscriptions
end

-- Helper function to merge customer subscriptions into entity subscriptions
-- Adds customer subscriptions that don't already exist in entity subscriptions (by subscription key)
-- For existing subscriptions, uses customer's plan if customer has features and entity doesn't
-- Does NOT merge quantities - only adds missing subscriptions
-- Used by getEntity.lua to add customer subscriptions to entity subscriptions
-- Parameters:
--   entitySubscriptions - array of entity subscriptions (base)
--   customerSubscriptions - array of customer subscriptions to add
-- Returns: array of merged subscriptions (entity subscriptions + customer subscriptions that don't exist)
local function mergeCustomerSubscriptionsIntoEntity(entitySubscriptions, customerSubscriptions)
    if not customerSubscriptions or #customerSubscriptions == 0 then
        return entitySubscriptions or {}
    end
    
    if not entitySubscriptions then
        entitySubscriptions = {}
    end
    
    -- Build a map of customer subscription keys to their subscriptions
    local customerKeyToSubscription = {}
    for _, customerSubscription in ipairs(customerSubscriptions) do
        local key = getSubscriptionKey(customerSubscription)
        customerKeyToSubscription[key] = customerSubscription
    end
    
    -- Build a set of existing subscription keys in entity subscriptions
    local existingKeys = {}
    for _, subscription in ipairs(entitySubscriptions) do
        local key = getSubscriptionKey(subscription)
        existingKeys[key] = true
    end
    
    -- Process entity subscriptions and use customer's plan if customer has features and entity doesn't
    local mergedSubscriptions = {}
    for _, entitySubscription in ipairs(entitySubscriptions) do
        local key = getSubscriptionKey(entitySubscription)
        local customerSubscription = customerKeyToSubscription[key]
        
        -- If customer has plan.features but entity doesn't, use customer's plan
        if customerSubscription then
            local entityHasFeatures = planHasFeatures(entitySubscription.plan)
            local customerHasFeatures = planHasFeatures(customerSubscription.plan)
            
            if customerHasFeatures and not entityHasFeatures then
                entitySubscription.plan = customerSubscription.plan
            end
        end
        
        table.insert(mergedSubscriptions, entitySubscription)
    end
    
    -- Then, add customer subscriptions that don't exist in entity
    for _, customerSubscription in ipairs(customerSubscriptions) do
        local key = getSubscriptionKey(customerSubscription)
        if not existingKeys[key] then
            table.insert(mergedSubscriptions, customerSubscription)
        end
    end
    
    return mergedSubscriptions
end

