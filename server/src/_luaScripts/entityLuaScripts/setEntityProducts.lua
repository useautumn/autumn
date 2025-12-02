-- setEntityProducts.lua
-- Updates both subscriptions and scheduled_subscriptions arrays in the entity cache
-- ARGV[1]: serialized subscriptions array JSON string (ApiSubscription[])
-- ARGV[2]: serialized scheduled_subscriptions array JSON string (ApiSubscription[])
-- ARGV[3]: org_id
-- ARGV[4]: env
-- ARGV[5]: customer_id
-- ARGV[6]: entity_id

local subscriptionsJson = ARGV[1]
local scheduledSubscriptionsJson = ARGV[2]
local orgId = ARGV[3]
local env = ARGV[4]
local customerId = ARGV[5]
local entityId = ARGV[6]

-- Build versioned cache key using shared utility
local cacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
local baseKey = cacheKey

-- Get base entity JSON
local baseJson = redis.call("GET", baseKey)
if not baseJson then
    return "OK" -- Entity doesn't exist, return early
end

-- Decode the base entity and subscriptions
local baseEntity = cjson.decode(baseJson)
local subscriptions = cjson.decode(subscriptionsJson)
local scheduledSubscriptions = cjson.decode(scheduledSubscriptionsJson)

-- Update the subscriptions fields
baseEntity.subscriptions = subscriptions
baseEntity.scheduled_subscriptions = scheduledSubscriptions

-- Store updated base entity as JSON and extend TTL
redis.call("SET", baseKey, cjson.encode(baseEntity))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

return "OK"

