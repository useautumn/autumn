-- getCustomer.lua
-- Atomically retrieves a customer object from Redis, reconstructing from base JSON and balance HSETs
-- Merges master customer balances with entity balances (unless skipEntityMerge is true)
-- ARGV[1]: cacheCustomerVersion (optional, overrides default cache version)
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customer_id
-- ARGV[5]: skipEntityMerge (optional, "true" to skip merging with entities)

-- Set version override (used by cacheKeyUtils functions)
-- This updates the local defined in cacheKeyUtils.lua (same concatenated script)
CACHE_CUSTOMER_VERSION_OVERRIDE = ARGV[1] ~= "" and ARGV[1] or nil

local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]
local skipEntityMerge = ARGV[5] == "true"

-- Get customer object using shared utility function
local customer = getCustomerObject(orgId, env, customerId, skipEntityMerge)

if not customer then
    return nil
end

return cjson.encode(customer)
