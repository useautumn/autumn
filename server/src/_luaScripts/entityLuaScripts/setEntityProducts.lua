-- setEntityProducts.lua
-- Updates only the products array in the entity cache
-- ARGV[1]: serialized products array JSON string
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id
-- ARGV[5]: entity_id

local productsJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]
local entityId = ARGV[5]

-- Build versioned cache key using shared utility
local cacheKey = buildEntityCacheKey(orgId, env, customerId, entityId)
local baseKey = cacheKey

-- Get base entity JSON
local baseJson = redis.call("GET", baseKey)
if not baseJson then
    return "OK" -- Entity doesn't exist, return early
end

-- Decode the base entity and products
local baseEntity = cjson.decode(baseJson)
local products = cjson.decode(productsJson)

-- Update only the products array
baseEntity.products = products

-- Store updated base entity as JSON and extend TTL
redis.call("SET", baseKey, cjson.encode(baseEntity))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

return "OK"

