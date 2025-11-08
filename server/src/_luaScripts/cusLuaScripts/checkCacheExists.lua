-- checkCacheExists.lua
-- Shared function to check if complete customer/entity cache exists
-- Validates base key + all features + all breakdowns + all rollovers

local function checkCacheExists(cacheKey)
    local baseJson = redis.call("GET", cacheKey)
    if not baseJson then
        return false
    end
    
    local base = cjson.decode(baseJson)
    local featureIds = base._featureIds or {}
    
    for _, featureId in ipairs(featureIds) do
        local featureKey = cacheKey .. ":features:" .. featureId
        local featureHash = redis.call("HGETALL", featureKey)
        if #featureHash == 0 then
            return false
        end
        
        -- Parse feature to get counts
        local featureData = {}
        for i = 1, #featureHash, 2 do
            featureData[featureHash[i]] = featureHash[i + 1]
        end
        
        -- Check all breakdowns exist
        local breakdownCount = tonumber(featureData._breakdown_count or 0)
        for i = 0, breakdownCount - 1 do
            if redis.call("EXISTS", featureKey .. ":breakdown:" .. i) == 0 then
                return false
            end
        end
        
        -- Check all rollovers exist
        local rolloverCount = tonumber(featureData._rollover_count or 0)
        for i = 0, rolloverCount - 1 do
            if redis.call("EXISTS", featureKey .. ":rollover:" .. i) == 0 then
                return false
            end
        end
    end
    
    return true
end

