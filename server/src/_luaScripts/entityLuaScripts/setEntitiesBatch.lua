-- setEntitiesBatch.lua
-- Atomically stores multiple entity objects in a single call
-- Uses new ApiEntity schema with balances (replacing features) and subscriptions (replacing products)
-- ARGV[1]: JSON array of entity data objects: [{entityId: "...", entityData: {...}}, ...]
-- ARGV[2]: org_id
-- ARGV[3]: env

local entitiesJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]

-- Decode the entities array
local entities = cjson.decode(entitiesJson)

-- Process each entity
for _, entityWrapper in ipairs(entities) do
    local entityId = entityWrapper.entityId
    local entityData = entityWrapper.entityData
    
    -- Build versioned cache key for this entity using shared utility
    local customerId = entityData.customer_id
    local cacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
    
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
    redis.call("SET", cacheKey, cjson.encode(baseEntity))
    redis.call("EXPIRE", cacheKey, CACHE_TTL_SECONDS)
    
    -- Store balances using shared utility function
    storeBalances(cacheKey, entityData.balances)
end

return "OK"

