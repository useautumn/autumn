--[[
  Delete FullCustomer from Redis cache.
  
  Atomically:
  1. Checks if test guard exists (skip if so - used in race condition tests)
  2. Optionally sets the stale-write guard key (to prevent in-flight requests from writing stale data)
  3. Deletes the cache key and path index key

  KEYS:
    [1] cacheKey
    [2] testGuardKey
    [3] guardKey
    [4] pathIdxKey

  ARGV:
    [1] guardTimestamp - timestamp for the guard
    [2] guardTtl - TTL in seconds for the guard key
    [3] skipGuard - "true" to skip setting guard key, "false" to set it (default behavior)

  Returns:
    "SKIPPED" = test guard exists, deletion skipped
    "DELETED" = cache key deleted successfully
    "NOT_FOUND" = cache key didn't exist
]]

local cacheKey = KEYS[1]
local testGuardKey = KEYS[2]
local guardKey = KEYS[3]
local pathIdxKey = KEYS[4]

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
redis.call("DEL", pathIdxKey)

if deleted > 0 then
    return "DELETED"
else
    return "NOT_FOUND"
end
