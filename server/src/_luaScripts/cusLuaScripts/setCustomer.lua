-- setCustomer.lua
-- Atomically stores a customer object with base data as JSON and balances/breakdowns as HSETs
-- Uses new ApiCustomer schema with balances (replacing features) and subscriptions (replacing products)
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

-- Extract balance IDs (feature_ids) for tracking
local balanceFeatureIds = {}
if customerData.balances then
    for featureId, _ in pairs(customerData.balances) do
        table.insert(balanceFeatureIds, featureId)
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

-- Store balance feature IDs and entity IDs in the base data for retrieval
customerData._balanceFeatureIds = balanceFeatureIds
customerData._entityIds = entityIds

-- Build base customer object (everything except balances)
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
    subscriptions = customerData.subscriptions,
    invoices = customerData.invoices,
    legacyData = customerData.legacyData,
    entities = customerData.entities,
    _balanceFeatureIds = balanceFeatureIds,
    _entityIds = entityIds
}

-- Store base customer as JSON with TTL
local baseKey = cacheKey
redis.call("SET", baseKey, cjson.encode(baseCustomer))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

-- Store balances using shared utility function
storeBalances(cacheKey, customerData.balances)

return "OK"

