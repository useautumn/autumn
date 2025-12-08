-- checkCacheExists.lua
-- Shared function to check if complete customer/entity cache exists
-- Validates base key + all balances + all breakdowns + all rollovers

local function checkCacheExists(cacheKey)
    local baseJson = redis.call("GET", cacheKey)
    if not baseJson then
        return false
    end
    
    local base = cjson.decode(baseJson)
    local balanceFeatureIds = base._balanceFeatureIds or {}
    
    for _, featureId in ipairs(balanceFeatureIds) do
        local balanceKey = buildBalanceCacheKey(cacheKey, featureId)
        local balanceHash = redis.call("HGETALL", balanceKey)
        if #balanceHash == 0 then
            return false
        end
        
        -- Parse balance to get counts
        local balanceData = {}
        for i = 1, #balanceHash, 2 do
            balanceData[balanceHash[i]] = balanceHash[i + 1]
        end
        
        -- Check all breakdowns exist
        local breakdownCount = tonumber(balanceData._breakdown_count or 0)
        for i = 0, breakdownCount - 1 do
            local breakdownKey = buildBreakdownCacheKey(cacheKey, featureId, i)
            if redis.call("EXISTS", breakdownKey) == 0 then
                return false
            end
        end
        
        -- Check all rollovers exist
        local rolloverCount = tonumber(balanceData._rollover_count or 0)
        for i = 0, rolloverCount - 1 do
            local rolloverKey = buildRolloverCacheKey(cacheKey, featureId, i)
            if redis.call("EXISTS", rolloverKey) == 0 then
                return false
            end
        end
    end
    
    return true
end

