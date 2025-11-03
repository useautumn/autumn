-- setCustomer.lua
-- Atomically stores a customer object with base data as JSON and features/breakdowns as HSETs
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
-- ARGV[1]: serialized customer data JSON string

local cacheKey = KEYS[1]
local customerDataJson = ARGV[1]

-- Decode the customer data
local customerData = cjson.decode(customerDataJson)

-- Extract feature IDs for tracking
local featureIds = {}
if customerData.features then
    for featureId, _ in pairs(customerData.features) do
        table.insert(featureIds, featureId)
    end
end

-- Store feature IDs in the base data for retrieval
customerData._featureIds = featureIds

-- Build base customer object (everything except features)
local baseCustomer = {
    id = customerData.id,
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
    _featureIds = featureIds
}

-- Store base customer as JSON
local baseKey = cacheKey
redis.call("SET", baseKey, cjson.encode(baseCustomer))

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
        
        -- Store all top-level feature fields in a single HSET call
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
        
        -- Store each rollover item as separate HSET (single call per rollover)
        if featureData.rollovers then
            for index, rolloverItem in ipairs(featureData.rollovers) do
                local rolloverKey = cacheKey .. ":features:" .. featureId .. ":rollover:" .. (index - 1)
                
                redis.call("HSET", rolloverKey,
                    "balance", toString(rolloverItem.balance),
                    "expires_at", toString(rolloverItem.expires_at)
                )
            end
        end
        
        -- Store each breakdown item as separate HSET (single call per breakdown)
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
            end
        end
    end
end

return "OK"

