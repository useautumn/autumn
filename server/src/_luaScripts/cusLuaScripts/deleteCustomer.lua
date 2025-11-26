-- deleteCustomer.lua
-- Atomically deletes a customer and all its associated entity caches
-- ARGV[1]: org_id
-- ARGV[2]: env
-- ARGV[3]: customer_id
-- Returns: number of keys deleted

local orgId = ARGV[1]
local env = ARGV[2]
local customerId = ARGV[3]

-- Helper function to add balance-related keys for a cache key
local function addBalanceKeys(keysToDelete, cacheKey, featureIds)
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
            local rolloverCount = tonumber(balanceHash["_rollover_count"] or 0)
            for i = 0, rolloverCount - 1 do
                table.insert(keysToDelete, buildRolloverCacheKey(cacheKey, featureId, i))
            end
            
            -- Delete breakdown keys
            local breakdownCount = tonumber(balanceHash["_breakdown_count"] or 0)
            for i = 0, breakdownCount - 1 do
                table.insert(keysToDelete, buildBreakdownCacheKey(cacheKey, featureId, i))
            end
        end
    end
end

-- Build versioned cache key using shared utility
local cacheKey = buildCustomerCacheKey(orgId, env, customerId)

-- Get the customer base JSON to find entity and feature IDs
local baseJson = redis.call("GET", cacheKey)
local keysToDelete = {cacheKey}

if baseJson then
    local customer = cjson.decode(baseJson)
    local entityIds = customer._entityIds or {}
    local balanceFeatureIds = customer._balanceFeatureIds or {}
    
    -- Add customer balance keys (with rollover/breakdown)
    addBalanceKeys(keysToDelete, cacheKey, balanceFeatureIds)
    
    -- Process each entity
    for _, entityId in ipairs(entityIds) do
        local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
        table.insert(keysToDelete, entityCacheKey)
        
        -- Get entity to find its feature IDs
        local entityJson = redis.call("GET", entityCacheKey)
        if entityJson then
            local entity = cjson.decode(entityJson)
            local entityFeatureIds = entity._balanceFeatureIds or {}
            
            -- Add entity balance keys (with rollover/breakdown)
            addBalanceKeys(keysToDelete, entityCacheKey, entityFeatureIds)
        end
    end
end

-- Use UNLINK instead of DEL for async deletion (non-blocking)
local deletedCount = 0
if #keysToDelete > 0 then
    deletedCount = redis.call("UNLINK", unpack(keysToDelete))
end

return deletedCount

