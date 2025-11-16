-- getCustomer.lua
-- Atomically retrieves a customer object from Redis, reconstructing from base JSON and balance HSETs
-- Merges master customer balances with entity balances (unless skipEntityMerge is true)
-- ARGV[1]: org_id
-- ARGV[2]: env
-- ARGV[3]: customer_id
-- ARGV[4]: skipEntityMerge (optional, "true" to skip merging with entities)

local orgId = ARGV[1]
local env = ARGV[2]
local customerId = ARGV[3]
local skipEntityMerge = ARGV[4] == "true"

-- Get customer object using shared utility function
local customer = getCustomerObject(orgId, env, customerId, skipEntityMerge)

if not customer then
    return nil
end

return cjson.encode(customer)
