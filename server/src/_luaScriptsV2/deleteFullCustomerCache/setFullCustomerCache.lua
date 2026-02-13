--[[
  Set FullCustomer in Redis cache.
  
  Atomically:
  1. Checks if stale-write guard exists and is newer than fetchTime (skip if so)
  2. Checks if cache already exists (skip if so, unless overwrite is true)
  3. Sets the cache using JSON.SET
  4. Sets TTL on the cache key

  KEYS:
    [1] guardKey - stale-write guard key to check
    [2] cacheKey - cache key to set

  ARGV:
    [1] fetchTimeMs - timestamp when data was fetched from Postgres
    [2] cacheTtl - TTL in seconds for the cache key
    [3] serializedData - JSON string of the FullCustomer data
    [4] overwrite - "1" to overwrite existing cache, "0" to skip if exists

  Returns:
    "STALE_WRITE" = guard exists with newer timestamp, write blocked
    "CACHE_EXISTS" = cache already exists, write skipped (only when overwrite is false)
    "OK" = cache set successfully
]]

local guardKey = KEYS[1]
local cacheKey = KEYS[2]
local fetchTimeMs = tonumber(ARGV[1])
local cacheTtl = tonumber(ARGV[2])
local serializedData = ARGV[3]
local overwrite = ARGV[4] == "true"

-- Check if guard exists (deletion happened recently)
-- Skip check if either value is nil/null/falsey
local guardTime = redis.call("GET", guardKey)
if guardTime and guardTime ~= cjson.null and fetchTimeMs then
    local guardTimeNum = tonumber(guardTime)
    if guardTimeNum and guardTimeNum > fetchTimeMs then
        return "STALE_WRITE"
    end
end

-- Check if cache already exists (skip this check if overwrite is true)
if not overwrite then
    local existing = redis.call("JSON.TYPE", cacheKey)
    if existing then
        return "CACHE_EXISTS"
    end
end

-- Set the cache using JSON.SET
redis.call("JSON.SET", cacheKey, "$", serializedData)
redis.call("EXPIRE", cacheKey, cacheTtl)

return "OK"
