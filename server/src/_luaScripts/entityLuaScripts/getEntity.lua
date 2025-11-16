-- getEntity.lua
-- Atomically retrieves an entity object from Redis, reconstructing from base JSON and balance HSETs
-- Merges entity balances with customer balances (unless skipCustomerMerge is true)
-- ARGV[1]: org_id
-- ARGV[2]: env
-- ARGV[3]: customerId
-- ARGV[4]: entityId
-- ARGV[5]: skipCustomerMerge (optional, "true" to skip merging with customer)

local orgId = ARGV[1]
local env = ARGV[2]
local customerId = ARGV[3]
local entityId = ARGV[4]
local skipCustomerMerge = ARGV[5] == "true"

-- Get entity object using shared utility function
local entity = getEntityObject(orgId, env, customerId, entityId, skipCustomerMerge)

if not entity then
    return nil
end

return cjson.encode(entity)

