--[[
  Set FullCustomer in Redis cache.
  
  Atomically:
  1. Checks if stale-write guard exists and is newer than fetchTime (skip if so)
  2. Checks if cache already exists (skip if so, unless overwrite is true)
  3. Sets the cache using JSON.SET
  4. Sets TTL on the cache key
  5. Replaces the path index Hash (DEL + HSET + EXPIRE)

  All keys are constructed internally from orgId/env/customerId using the
  prepended key builder functions.

  KEYS:
    [1] cacheKey - used for cluster slot routing only

  ARGV:
    [1] orgId
    [2] env
    [3] customerId
    [4] fetchTimeMs - timestamp when data was fetched from Postgres
    [5] cacheTtl - TTL in seconds for the cache key
    [6] serializedData - JSON string of the FullCustomer data
    [7] overwrite - "true" to overwrite existing cache, "false" to skip if exists
    [8] pathIndexJson - JSON object mapping field names to values for HSET (e.g. {"ent:id1":"{...}", ...})

  Returns:
    "STALE_WRITE" = guard exists with newer timestamp, write blocked
    "CACHE_EXISTS" = cache already exists, write skipped (only when overwrite is false)
    "OK" = cache set successfully
]]

local org_id = ARGV[1]
local env = ARGV[2]
local customer_id = ARGV[3]
local fetchTimeMs = tonumber(ARGV[4])
local cacheTtl = tonumber(ARGV[5])
local serializedData = ARGV[6]
local overwrite = ARGV[7] == "true"
local pathIndexJson = ARGV[8]

local guardKey = build_guard_key(org_id, env, customer_id)
local cacheKey = build_full_customer_cache_key(org_id, env, customer_id)
local pathIdxKey = build_path_index_key(org_id, env, customer_id)

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

-- Atomically replace the path index Hash
if pathIndexJson and pathIndexJson ~= "" then
    local entries = cjson.decode(pathIndexJson)
    redis.call("DEL", pathIdxKey)
    local args = {}
    for k, v in pairs(entries) do
        args[#args + 1] = k
        args[#args + 1] = v
    end
    if #args > 0 then
        redis.call("HSET", pathIdxKey, unpack(args))
        redis.call("EXPIRE", pathIdxKey, cacheTtl)
    end
end

return "OK"
