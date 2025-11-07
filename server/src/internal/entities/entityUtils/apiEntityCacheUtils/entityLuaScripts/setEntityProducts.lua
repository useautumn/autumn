-- setEntityProducts.lua
-- Updates only the products array in the entity cache
-- KEYS[1]: cache key (e.g., "{org_id}:env:customer:customer_id:entity:entity_id")
-- ARGV[1]: serialized products array JSON string

local cacheKey = KEYS[1]
local productsJson = ARGV[1]
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

-- Store updated base entity as JSON
redis.call("SET", baseKey, cjson.encode(baseEntity))

return "OK"

