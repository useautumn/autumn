-- getEntity.lua
-- Atomically retrieves an entity object from Redis, reconstructing from base JSON and balance HSETs
-- Merges entity balances with customer balances (unless skipCustomerMerge is true)
-- ARGV[1]: cacheCustomerVersion (optional, overrides default cache version)
-- ARGV[2]: org_id
-- ARGV[3]: env
-- ARGV[4]: customerId
-- ARGV[5]: entityId
-- ARGV[6]: skipCustomerMerge (optional, "true" to skip merging with customer)

-- Set version override (used by cacheKeyUtils functions)
-- This updates the local defined in cacheKeyUtils.lua (same concatenated script)
CACHE_CUSTOMER_VERSION_OVERRIDE = ARGV[1] ~= "" and ARGV[1] or nil

local orgId = ARGV[2]
local env = ARGV[3]
local customerId = ARGV[4]
local entityId = ARGV[5]
local skipCustomerMerge = ARGV[6] == "true"

-- Get entity object using shared utility function
local entity = getEntityObject(orgId, env, customerId, entityId, skipCustomerMerge)

if not entity then
    return nil
end

return cjson.encode(entity)

