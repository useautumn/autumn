-- setCustomerDetails.lua
-- Updates only the customer detail fields (name, email, etc.) in the customer cache
-- ARGV[1]: serialized customer details JSON string (object with name, email, etc.)
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id

local detailsJson = ARGV[1]
local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]

-- Build versioned cache key using shared utility
local cacheKey = buildCustomerCacheKey(orgId, env, customerId)
local baseKey = cacheKey

-- Get base customer JSON
local baseJson = redis.call("GET", baseKey)
if not baseJson then
    return "NOT_FOUND" -- Customer doesn't exist, return early
end

-- Decode the base customer and new details
local baseCustomer = cjson.decode(baseJson)
local details = cjson.decode(detailsJson)

-- Update detail fields if they are provided
if details.name ~= nil then
    baseCustomer.name = details.name
end
if details.email ~= nil then
    baseCustomer.email = details.email
end
if details.fingerprint ~= nil then
    baseCustomer.fingerprint = details.fingerprint
end
if details.metadata ~= nil then
    baseCustomer.metadata = details.metadata
end

-- Store updated base customer as JSON and extend TTL
redis.call("SET", baseKey, cjson.encode(baseCustomer))
redis.call("EXPIRE", baseKey, CACHE_TTL_SECONDS)

return "OK"

