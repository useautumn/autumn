-- setCustomerProducts.lua
-- Updates only the products array in the customer cache
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
-- ARGV[1]: serialized products array JSON string

local cacheKey = KEYS[1]
local productsJson = ARGV[1]
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

-- Store updated base customer as JSON
redis.call("SET", baseKey, cjson.encode(baseCustomer))

return "OK"

