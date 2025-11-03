-- getCustomer.lua
-- Atomically retrieves a customer object from Redis, reconstructing from base JSON and feature HSETs
-- KEYS[1]: customer ID

local customerId = KEYS[1]
local baseKey = "customer:" .. customerId

-- Get base customer JSON
local baseJson = redis.call("GET", baseKey)
if not baseJson then
    return nil
end

local baseCustomer = cjson.decode(baseJson)
local featureIds = baseCustomer._featureIds or {}

-- Build features object
local features = {}

for _, featureId in ipairs(featureIds) do
    local featureKey = "customer:" .. customerId .. ":features:" .. featureId
    local featureHash = redis.call("HGETALL", featureKey)
    
    -- If feature key is missing, return nil (partial eviction detected)
    if #featureHash == 0 then
        return nil
    end
    
        -- Convert HGETALL result (flat array) to table
        local featureData = {}
        for i = 1, #featureHash, 2 do
            local key = featureHash[i]
            local value = featureHash[i + 1]
            
            -- Parse numeric values
            if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" or key == "_breakdown_count" or key == "_rollover_count" then
                featureData[key] = tonumber(value)
            elseif key == "unlimited" or key == "overage_allowed" then
                featureData[key] = (value == "true")
            elseif key == "credit_schema" then
                -- Parse credit_schema JSON array
                if value ~= "null" and value ~= "" then
                    featureData[key] = cjson.decode(value)
                else
                    featureData[key] = cjson.null
                end
            elseif value == "null" then
                featureData[key] = cjson.null
            else
                featureData[key] = value
            end
        end
    
    -- Get rollover count
    local rolloverCount = featureData._rollover_count or 0
    featureData._rollover_count = nil -- Remove from final output
    
    -- Fetch rollover items
    local rollovers = {}
    for i = 0, rolloverCount - 1 do
        local rolloverKey = "customer:" .. customerId .. ":features:" .. featureId .. ":rollover:" .. i
        local rolloverHash = redis.call("HGETALL", rolloverKey)
        
        -- If rollover key is missing, return nil (partial eviction detected)
        if #rolloverHash == 0 then
            return nil
        end
        
        local rolloverData = {}
        for j = 1, #rolloverHash, 2 do
            local key = rolloverHash[j]
            local value = rolloverHash[j + 1]
            
            if key == "balance" or key == "expires_at" then
                rolloverData[key] = tonumber(value)
            elseif value == "null" then
                rolloverData[key] = cjson.null
            else
                rolloverData[key] = value
            end
        end
        table.insert(rollovers, rolloverData)
    end
    
    if #rollovers > 0 then
        featureData.rollovers = rollovers
    end
    
    -- Get breakdown count
    local breakdownCount = featureData._breakdown_count or 0
    featureData._breakdown_count = nil -- Remove from final output
    
    -- Fetch breakdown items
    local breakdown = {}
    for i = 0, breakdownCount - 1 do
        local breakdownKey = "customer:" .. customerId .. ":features:" .. featureId .. ":breakdown:" .. i
        local breakdownHash = redis.call("HGETALL", breakdownKey)
        
        -- If breakdown key is missing, return nil (partial eviction detected)
        if #breakdownHash == 0 then
            return nil
        end
        
                local breakdownData = {}
                for j = 1, #breakdownHash, 2 do
                    local key = breakdownHash[j]
                    local value = breakdownHash[j + 1]
                    
                    if key == "balance" or key == "usage" or key == "included_usage" or key == "usage_limit" or key == "interval_count" then
                        breakdownData[key] = tonumber(value)
                    elseif value == "null" then
                        breakdownData[key] = cjson.null
                    else
                        breakdownData[key] = value
                    end
                end
                table.insert(breakdown, breakdownData)
    end
    
    if #breakdown > 0 then
        featureData.breakdown = breakdown
    end
    
    features[featureId] = featureData
end

-- Build final customer object
baseCustomer._featureIds = nil -- Remove tracking field
baseCustomer.features = features

return cjson.encode(baseCustomer)

