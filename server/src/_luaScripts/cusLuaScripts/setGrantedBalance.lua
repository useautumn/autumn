-- setGrantedBalance.lua
-- Atomically sets granted_balance in the Redis cache for all features
-- Updates both top-level balance and breakdown items
-- Supports both customer-level and batch entity updates
--
-- ARGV[1]: org_id
-- ARGV[2]: env
-- ARGV[3]: customer_id
-- ARGV[4]: customer_balances_json - JSON object: { [featureId]: { granted_balance, breakdown: [{ id, granted_balance }] } }
-- ARGV[5]: entity_batch_json - JSON array: [{ entityId, balances: { [featureId]: { granted_balance, breakdown } } }]

local orgId = ARGV[1]
local env = ARGV[2]
local customerId = ARGV[3]
local customerBalancesJson = ARGV[4]
local entityBatchJson = ARGV[5]

-- Helper function to update balances for a given cache key
local function updateBalancesForCacheKey(cacheKey, balances)
    for featureId, balanceData in pairs(balances) do
        local balanceKey = buildBalanceCacheKey(cacheKey, featureId)
        
        -- Check if balance exists
        local balanceExists = redis.call("EXISTS", balanceKey)
        if balanceExists == 1 then
            -- Update top-level granted_balance
            redis.call("HSET", balanceKey, "granted_balance", tostring(balanceData.granted_balance))
            
            -- Update breakdown items if provided
            if balanceData.breakdown then
                -- Get breakdown count from cache
                local breakdownCount = tonumber(redis.call("HGET", balanceKey, "_breakdown_count")) or 0
                
                -- Build a map of breakdown id -> granted_balance from input
                local breakdownMap = {}
                for _, bd in ipairs(balanceData.breakdown) do
                    if bd.id then
                        breakdownMap[bd.id] = bd.granted_balance
                    end
                end
                
                -- Update each breakdown item
                for i = 0, breakdownCount - 1 do
                    local breakdownKey = buildBreakdownCacheKey(cacheKey, featureId, i)
                    local bdId = redis.call("HGET", breakdownKey, "id")
                    
                    if bdId and breakdownMap[bdId] then
                        redis.call("HSET", breakdownKey, "granted_balance", tostring(breakdownMap[bdId]))
                    end
                end
            end
        end
    end
end

-- 1. Update customer-level cache
if customerBalancesJson and customerBalancesJson ~= "" then
    local customerCacheKey = buildCustomerCacheKey(orgId, env, customerId)
    local customerBalances = cjson.decode(customerBalancesJson)
    updateBalancesForCacheKey(customerCacheKey, customerBalances)
end

-- 2. Update entity caches in batch
if entityBatchJson and entityBatchJson ~= "" then
    local entityBatch = cjson.decode(entityBatchJson)
    
    for _, entityData in ipairs(entityBatch) do
        local entityCacheKey = buildEntityCacheKey(orgId, env, customerId, entityData.entityId)
        updateBalancesForCacheKey(entityCacheKey, entityData.balances)
    end
end

return "OK"
