-- batchDeleteCustomers.lua
-- Atomically deletes multiple customers and all their associated entity caches
-- ARGV[1]: JSON array of {orgId, env, customerId} objects
-- Returns: number of keys deleted

local customersJson = ARGV[1]
local customers = cjson.decode(customersJson)
local allKeysToDelete = {}

-- Helper function to add balance-related keys for a cache key
local function addBalanceKeys(keysToDelete, cacheKey, featureIds)
    if not featureIds or #featureIds == 0 then
        return
    end
    
    for _, featureId in ipairs(featureIds) do
        local balanceKey = buildBalanceCacheKey(cacheKey, featureId)
        table.insert(keysToDelete, balanceKey)
        
        -- Get the balance HSET to find breakdown/rollover counts
        local balanceData = redis.call("HGETALL", balanceKey)
        if balanceData and #balanceData > 0 then
            -- Convert array to hash table
            local balanceHash = {}
            for i = 1, #balanceData, 2 do
                balanceHash[balanceData[i]] = balanceData[i + 1]
            end
            
            -- Delete rollover keys
            local rolloverCount = tonumber(balanceHash["_rollover_count"]) or 0
            for i = 0, rolloverCount - 1 do
                table.insert(keysToDelete, buildRolloverCacheKey(cacheKey, featureId, i))
            end
            
            -- Delete breakdown keys
            local breakdownCount = tonumber(balanceHash["_breakdown_count"]) or 0
            for i = 0, breakdownCount - 1 do
                table.insert(keysToDelete, buildBreakdownCacheKey(cacheKey, featureId, i))
            end
        end
    end
end

-- Process each customer
for _, customerInfo in ipairs(customers) do
    local orgId = customerInfo.orgId
    local env = customerInfo.env
    local customerId = customerInfo.customerId
    
    -- Build versioned cache key using shared utility
    local cacheKey = buildCustomerCacheKey(orgId, env, customerId)
    
    -- Get the customer base JSON to find entity and feature IDs
    local baseJson = redis.call("GET", cacheKey)
    
    -- Skip if customer not in cache
    if baseJson then
        table.insert(allKeysToDelete, cacheKey)
        local success, customer = pcall(cjson.decode, baseJson)
        if success and customer then
            local entityIds = customer._entityIds or {}
            local balanceFeatureIds = customer._balanceFeatureIds or {}
            
            -- Add customer balance keys (with rollover/breakdown)
            addBalanceKeys(allKeysToDelete, cacheKey, balanceFeatureIds)
            
            -- Process each entity
            for _, entityId in ipairs(entityIds) do
                local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
                table.insert(allKeysToDelete, entityCacheKey)
                
                -- Get entity to find its feature IDs
                local entityJson = redis.call("GET", entityCacheKey)
                if entityJson then
                    local entitySuccess, entity = pcall(cjson.decode, entityJson)
                    if entitySuccess and entity then
                        local entityFeatureIds = entity._balanceFeatureIds or {}
                        
                        -- Add entity balance keys (with rollover/breakdown)
                        addBalanceKeys(allKeysToDelete, entityCacheKey, entityFeatureIds)
                    end
                end
            end
        end
    end
end

-- Use UNLINK instead of DEL for async deletion (non-blocking)
local deletedCount = 0
if #allKeysToDelete > 0 then
    -- UNLINK has a limit, so batch in chunks of 1000 keys
    local chunkSize = 1000
    for i = 1, #allKeysToDelete, chunkSize do
        local chunk = {}
        for j = i, math.min(i + chunkSize - 1, #allKeysToDelete) do
            table.insert(chunk, allKeysToDelete[j])
        end
        deletedCount = deletedCount + redis.call("UNLINK", unpack(chunk))
    end
end

return deletedCount

