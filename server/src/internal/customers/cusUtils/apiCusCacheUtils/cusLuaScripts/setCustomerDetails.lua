-- setCustomerDetails.lua
-- Updates only the customer detail fields (name, email, etc.) in the customer cache
-- KEYS[1]: cache key (e.g., "org_id:env:customer:customer_id")
-- ARGV[1]: serialized customer details JSON string (object with name, email, etc.)

local cacheKey = KEYS[1]
local detailsJson = ARGV[1]
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

-- Store updated base customer as JSON
redis.call("SET", baseKey, cjson.encode(baseCustomer))

return "OK"

