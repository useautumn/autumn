--[[
  Batch delete multiple FullCustomer caches from Redis.
  
  For each customer, atomically:
  1. Checks if test guard exists (skip that customer if so)
  2. Sets the stale-write guard key
  3. Deletes the cache key

  KEYS: none (all keys passed via ARGV to support variable number of customers)

  ARGV:
    [1] guardTimestamp - timestamp for all guards
    [2] guardTtl - TTL in seconds for guard keys
    [3] customersJson - JSON array of {testGuardKey, guardKey, cacheKey} objects

  Returns:
    JSON object: { deleted: number, skipped: number }
]]

local guardTimestamp = ARGV[1]
local guardTtl = tonumber(ARGV[2])
local customersJson = ARGV[3]

local customers = cjson.decode(customersJson)
local deleted = 0
local skipped = 0

for _, customer in ipairs(customers) do
    local testGuardKey = customer.testGuardKey
    local guardKey = customer.guardKey
    local cacheKey = customer.cacheKey

    -- Check test guard first
    if redis.call("EXISTS", testGuardKey) == 1 then
        skipped = skipped + 1
    else
        -- Set stale-write guard and delete cache
        redis.call("SET", guardKey, guardTimestamp, "EX", guardTtl)
        local wasDeleted = redis.call("DEL", cacheKey)
        if wasDeleted > 0 then
            deleted = deleted + 1
        end
    end
end

return cjson.encode({ deleted = deleted, skipped = skipped })
