--[[
  Reserve a FullSubject write so only one non-overwrite writer proceeds.

  KEYS:
    [1] subjectKey
    [2] reserveKey
    [3] guardKey

  ARGV:
    [1] token
    [2] reserveTtl
    [3] overwrite - "true" to bypass reservation, "false" to reserve if missing
    [4] fetchTimeMs

  Returns:
    "RESERVED" = caller may proceed with the write
    "CACHE_EXISTS" = subject already exists or another writer already reserved it
    "STALE_WRITE" = guard exists with newer timestamp than this write
]]

local subjectKey = KEYS[1]
local reserveKey = KEYS[2]
local guardKey = KEYS[3]
local token = ARGV[1]
local reserveTtl = tonumber(ARGV[2])
local overwrite = ARGV[3] == "true"
local fetchTimeMs = tonumber(ARGV[4])

if overwrite then
  return "RESERVED"
end

local guardTime = redis.call("GET", guardKey)
if guardTime and guardTime ~= cjson.null and fetchTimeMs then
  local guardTimeNum = tonumber(guardTime)
  if guardTimeNum and guardTimeNum > fetchTimeMs then
    return "STALE_WRITE"
  end
end

if redis.call("EXISTS", subjectKey) == 1 then
  return "CACHE_EXISTS"
end

local reserved = redis.call("SET", reserveKey, token, "EX", reserveTtl, "NX")
if not reserved then
  return "CACHE_EXISTS"
end

return "RESERVED"
