-- setCustomerProducts.lua
-- Updates only the products array in the customer cache
-- ARGV[1]: serialized products array JSON string
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id

local productsJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]

-- Build versioned cache key using shared utility
local cacheKey = buildCustomerCacheKey(orgId, env, customerId)
local baseKey = cacheKey

-- Get base customer JSON
local baseJson = redis.call("GET", baseKey)
if not baseJson then
    return "OK" -- Customer doesn't exist, return early
end

-- Decode the base customer and products
local baseCustomer = cjson.decode(baseJson)
local products = cjson.decode(productsJson)

-- Update only the products array
baseCustomer.products = products

-- Store updated base customer as JSON and extend TTL
redis.call("SET", baseKey, cjson.encode(baseCustomer))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

return "OK"

