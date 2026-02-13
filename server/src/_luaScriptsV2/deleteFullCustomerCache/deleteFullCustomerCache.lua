--[[
  Delete FullCustomer from Redis cache.
  
  Atomically:
  1. Checks if test guard exists (skip if so - used in race condition tests)
  2. Optionally sets the stale-write guard key (to prevent in-flight requests from writing stale data)
  3. Deletes the cache key

  KEYS:
    [1] testGuardKey - test guard key to check
    [2] guardKey - stale-write guard key to set
    [3] cacheKey - cache key to delete

  ARGV:
    [1] guardTimestamp - timestamp for the guard
    [2] guardTtl - TTL in seconds for the guard key
    [3] skipGuard - "true" to skip setting guard key, "false" to set it (default behavior)

  Returns:
    "SKIPPED" = test guard exists, deletion skipped
    "DELETED" = cache key deleted successfully
    "NOT_FOUND" = cache key didn't exist
]]

local testGuardKey = KEYS[1]
local guardKey = KEYS[2]
local cacheKey = KEYS[3]
local guardTimestamp = ARGV[1]
local guardTtl = tonumber(ARGV[2])
local skipGuard = ARGV[3] == "true"

-- Check test guard first (used in race condition tests)
if redis.call("EXISTS", testGuardKey) == 1 then
    return "SKIPPED"
end

-- Set stale-write guard unless skipped
if not skipGuard then
    redis.call("SET", guardKey, guardTimestamp, "EX", guardTtl)
end

local deleted = redis.call("DEL", cacheKey)

if deleted > 0 then
    return "DELETED"
else
    return "NOT_FOUND"
end
