-- setSubscriptions.lua
-- Updates both subscriptions and scheduled_subscriptions arrays in the customer cache
-- ARGV[1]: serialized subscriptions array JSON string (ApiSubscription[])
-- ARGV[2]: serialized scheduled_subscriptions array JSON string (ApiSubscription[])
-- ARGV[3]: org_id
-- ARGV[4]: env
-- ARGV[5]: customer_id

local subscriptionsJson = ARGV[1]
local scheduledSubscriptionsJson = ARGV[2]
local orgId = ARGV[3]
local env = ARGV[4]
local customerId = ARGV[5]

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
local scheduledSubscriptions = cjson.decode(scheduledSubscriptionsJson)

-- Update the subscriptions fields
baseCustomer.subscriptions = subscriptions
baseCustomer.scheduled_subscriptions = scheduledSubscriptions

-- Store updated base customer as JSON and extend TTL
redis.call("SET", baseKey, cjson.encode(baseCustomer))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

return "OK"

