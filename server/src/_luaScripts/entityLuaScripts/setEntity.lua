-- setEntity.lua
-- Atomically stores an entity object with base data as JSON and features/breakdowns as HSETs
-- ARGV[1]: serialized entity data JSON string
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id
-- ARGV[5]: entity_id

local entityDataJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]
local entityId = ARGV[5]

-- Build versioned cache key using shared utility
local cacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)

-- Check if complete cache already exists
if checkCacheExists(cacheKey) then
    return "CACHE_EXISTS"
end

-- Decode the entity data
local entityData = cjson.decode(entityDataJson)

-- Extract feature IDs for tracking
local featureIds = {}
if entityData.features then
    for featureId, _ in pairs(entityData.features) do
        table.insert(featureIds, featureId)
    end
end

-- Store feature IDs in the base data for retrieval
entityData._featureIds = featureIds

-- Build base entity object (everything except features)
local baseEntity = {
    id = entityData.id,
    autumn_id = entityData.autumn_id,
    name = entityData.name,
    customer_id = entityData.customer_id,
    created_at = entityData.created_at,
    env = entityData.env,
    products = entityData.products,
    _featureIds = featureIds
}

-- Store base entity as JSON with TTL
local baseKey = cacheKey
redis.call("SET", baseKey, cjson.encode(baseEntity))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

-- Helper function to convert values to strings, handling cjson.null
local function toString(value)
    if value == cjson.null or value == nil then
        return "null"
    end
    return tostring(value)
end

-- Store each feature as HSET
if entityData.features then
    for featureId, featureData in pairs(entityData.features) do
        local featureKey = cacheKey .. ":features:" .. featureId
        
        -- Store breakdown count for reconstruction
        local breakdownCount = 0
        if featureData.breakdown then
            breakdownCount = #featureData.breakdown
        end
        
        -- Store rollover count for reconstruction
        local rolloverCount = 0
        if featureData.rollovers then
            rolloverCount = #featureData.rollovers
        end
        
        -- Serialize credit_schema as JSON string
        local creditSchemaJson = "null"
        if featureData.credit_schema and #featureData.credit_schema > 0 then
            creditSchemaJson = cjson.encode(featureData.credit_schema)
        end
        
        -- Store all top-level feature fields in a single HSET call with TTL
        redis.call("HSET", featureKey,
            "id", toString(featureData.id),
            "type", toString(featureData.type),
            "name", toString(featureData.name),
            "interval", toString(featureData.interval),
            "interval_count", toString(featureData.interval_count),
            "unlimited", toString(featureData.unlimited),
            "balance", toString(featureData.balance),
            "usage", toString(featureData.usage),
            "included_usage", toString(featureData.included_usage),
            "next_reset_at", toString(featureData.next_reset_at),
            "overage_allowed", toString(featureData.overage_allowed),
            "usage_limit", toString(featureData.usage_limit),
            "credit_schema", creditSchemaJson,
            "_breakdown_count", toString(breakdownCount),
            "_rollover_count", toString(rolloverCount)
        )
        redis.call("EXPIRE", featureKey, CACHE_TTL_SECONDS)
        
        -- Store each rollover item as separate HSET with TTL (single call per rollover)
        if featureData.rollovers then
            for index, rolloverItem in ipairs(featureData.rollovers) do
                local rolloverKey = cacheKey .. ":features:" .. featureId .. ":rollover:" .. (index - 1)
                
                redis.call("HSET", rolloverKey,
                    "balance", toString(rolloverItem.balance),
                    "expires_at", toString(rolloverItem.expires_at)
                )
                redis.call("EXPIRE", rolloverKey, CACHE_TTL_SECONDS)
            end
        end
        
        -- Store each breakdown item as separate HSET with TTL (single call per breakdown)
        if featureData.breakdown then
            for index, breakdownItem in ipairs(featureData.breakdown) do
                local breakdownKey = cacheKey .. ":features:" .. featureId .. ":breakdown:" .. (index - 1)
                
                redis.call("HSET", breakdownKey,
                    "interval", toString(breakdownItem.interval),
                    "interval_count", toString(breakdownItem.interval_count),
                    "balance", toString(breakdownItem.balance),
                    "usage", toString(breakdownItem.usage),
                    "included_usage", toString(breakdownItem.included_usage),
                    "next_reset_at", toString(breakdownItem.next_reset_at),
                    "usage_limit", toString(breakdownItem.usage_limit),
                    "overage_allowed", toString(breakdownItem.overage_allowed)
                )
                redis.call("EXPIRE", breakdownKey, CACHE_TTL_SECONDS)
            end
        end
    end
end

return "OK"

