-- setEntity.lua
-- Atomically stores an entity object with base data as JSON and balances/breakdowns as HSETs
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

-- Extract balance IDs (feature_ids) for tracking
local balanceFeatureIds = {}
if entityData.balances then
    for featureId, _ in pairs(entityData.balances) do
        table.insert(balanceFeatureIds, featureId)
    end
end

-- Store balance feature IDs in the base data for retrieval
entityData._balanceFeatureIds = balanceFeatureIds

-- Build base entity object (everything except balances)
local baseEntity = {
    id = entityData.id,
    autumn_id = entityData.autumn_id,
    name = entityData.name,
    customer_id = entityData.customer_id,
    created_at = entityData.created_at,
    env = entityData.env,
    subscriptions = entityData.subscriptions,
    scheduled_subscriptions = entityData.scheduled_subscriptions,
    legacyData = entityData.legacyData,
    _balanceFeatureIds = balanceFeatureIds
}

-- Store base entity as JSON with TTL
local baseKey = cacheKey
redis.call("SET", baseKey, cjson.encode(baseEntity))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

-- Store balances using shared utility function
storeBalances(cacheKey, entityData.balances)

return "OK"

