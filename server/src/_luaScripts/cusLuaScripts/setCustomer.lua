-- setCustomer.lua
-- Atomically stores a customer object with base data as JSON and features/breakdowns as HSETs
-- Separates master customer features from entity features
-- ARGV[1]: serialized customer data JSON string
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id

local customerDataJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]

-- Build versioned cache key using shared utility
local cacheKey = buildCustomerCacheKey(orgId, env, customerId)

-- Check if complete cache already exists
if checkCacheExists(cacheKey) then
    return "CACHE_EXISTS"
end

-- Decode the customer data
local customerData = cjson.decode(customerDataJson)

-- Extract feature IDs for tracking
local featureIds = {}
if customerData.features then
    for featureId, _ in pairs(customerData.features) do
        table.insert(featureIds, featureId)
    end
end

-- Extract entity IDs from entities array
local entityIds = {}
if customerData.entities then
    for _, entity in ipairs(customerData.entities) do
        if entity.id then
            table.insert(entityIds, entity.id)
        end
    end
end

-- Store feature IDs and entity IDs in the base data for retrieval
customerData._featureIds = featureIds
customerData._entityIds = entityIds

-- Build base customer object (everything except features)
local baseCustomer = {
    id = customerData.id,
    autumn_id = customerData.autumn_id,
    created_at = customerData.created_at,
    name = customerData.name,
    email = customerData.email,
    fingerprint = customerData.fingerprint,
    stripe_id = customerData.stripe_id,
    env = customerData.env,
    metadata = customerData.metadata,
    products = customerData.products,
    invoices = customerData.invoices,
    legacyData = customerData.legacyData,
    entities = customerData.entities,
    _featureIds = featureIds,
    _entityIds = entityIds
}

-- Store base customer as JSON with TTL
local baseKey = cacheKey
redis.call("SET", baseKey, cjson.encode(baseCustomer))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

-- Helper function to convert values to strings, handling cjson.null
local function toString(value)
    if value == cjson.null or value == nil then
        return "null"
    end
    return tostring(value)
end

-- Store each feature as HSET
if customerData.features then
    for featureId, featureData in pairs(customerData.features) do
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

