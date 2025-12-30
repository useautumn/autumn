-- cacheBalanceUtils.lua
-- Shared utility functions for storing balances to Redis cache
-- Used by setCustomer.lua and setEntity.lua (after migration)

-- Helper function to convert values to strings, handling cjson.null
local function toString(value)
    if value == cjson.null or value == nil then
        return "null"
    end
    return tostring(value)
end

-- Helper function to serialize reset object as JSON
local function serializeReset(reset)
    if reset == nil or reset == cjson.null then
        return "null"
    end
    return cjson.encode(reset)
end

-- Store balances to Redis cache
-- Parameters:
--   cacheKey: Base cache key (e.g., customer or entity cache key)
--   balances: Table containing balance data (record of featureId -> balanceData)
-- Returns: nothing (void function)
local function storeBalances(cacheKey, balances)
    if not balances then
        return
    end
    
    for featureId, balanceData in pairs(balances) do
        local balanceKey = buildBalanceCacheKey(cacheKey, featureId)
        
        -- Store breakdown count for reconstruction
        local breakdownCount = 0
        if balanceData.breakdown then
            breakdownCount = #balanceData.breakdown
        end
        
        -- Store rollover count for reconstruction
        local rolloverCount = 0
        if balanceData.rollovers then
            rolloverCount = #balanceData.rollovers
        end
        
        -- Serialize feature object as JSON string (optional field)
        local featureJson = "null"
        if balanceData.feature then
            featureJson = cjson.encode(balanceData.feature)
        end
        
        -- Serialize reset object as JSON string (optional field)
        local resetJson = serializeReset(balanceData.reset)
        
        -- Store all top-level balance fields in a single HSET call with TTL
        redis.call("HSET", balanceKey,
            "feature_id", toString(balanceData.feature_id),
            "feature", featureJson,
            "plan_id", toString(balanceData.plan_id),
            "unlimited", toString(balanceData.unlimited),
            "granted_balance", toString(balanceData.granted_balance),
            "purchased_balance", toString(balanceData.purchased_balance),
            "current_balance", toString(balanceData.current_balance),
            "usage", toString(balanceData.usage),
            "max_purchase", toString(balanceData.max_purchase),
            "overage_allowed", toString(balanceData.overage_allowed),
            "reset", resetJson,
            "_breakdown_count", toString(breakdownCount),
            "_rollover_count", toString(rolloverCount)
        )
        redis.call("EXPIRE", balanceKey, CACHE_TTL_SECONDS)
        
        -- Store each rollover item as separate HSET with TTL (single call per rollover)
        if balanceData.rollovers then
            for index, rolloverItem in ipairs(balanceData.rollovers) do
                local rolloverKey = buildRolloverCacheKey(cacheKey, featureId, index - 1)
                
                redis.call("HSET", rolloverKey,
                    "balance", toString(rolloverItem.balance),
                    "expires_at", toString(rolloverItem.expires_at)
                )
                redis.call("EXPIRE", rolloverKey, CACHE_TTL_SECONDS)
            end
        end
        
        -- Store each breakdown item as separate HSET with TTL (single call per breakdown)
        if balanceData.breakdown then
            for index, breakdownItem in ipairs(balanceData.breakdown) do
                local breakdownKey = buildBreakdownCacheKey(cacheKey, featureId, index - 1)
                
                -- Serialize breakdown reset object as JSON
                local breakdownResetJson = serializeReset(breakdownItem.reset)
                
                redis.call("HSET", breakdownKey,
                    "id", breakdownItem.id and toString(breakdownItem.id) or "",
                    "granted_balance", toString(breakdownItem.granted_balance),
                    "purchased_balance", toString(breakdownItem.purchased_balance),
                    "current_balance", toString(breakdownItem.current_balance),
                    "usage", toString(breakdownItem.usage),
                    "max_purchase", toString(breakdownItem.max_purchase),
                    "overage_allowed", toString(breakdownItem.overage_allowed),
                    "reset", breakdownResetJson,
                    "plan_id", toString(breakdownItem.plan_id)
                )
                redis.call("EXPIRE", breakdownKey, CACHE_TTL_SECONDS)
            end
        end
    end
end

