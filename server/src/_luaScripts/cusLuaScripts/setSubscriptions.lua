-- setSubscriptions.lua
-- Updates only the subscriptions array in the customer cache
-- ARGV[1]: serialized subscriptions array JSON string (ApiSubscription[])
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id

local subscriptionsJson = ARGV[1]
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

-- Decode the base customer and subscriptions
local baseCustomer = cjson.decode(baseJson)
local subscriptions = cjson.decode(subscriptionsJson)

-- Update the subscriptions field
baseCustomer.subscriptions = subscriptions

-- Store updated base customer as JSON and extend TTL
redis.call("SET", baseKey, cjson.encode(baseCustomer))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

return "OK"

