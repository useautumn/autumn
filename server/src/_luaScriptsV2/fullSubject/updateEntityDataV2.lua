--[[
  Lua Script: Update Entity Data in FullSubject V2 Redis Cache

  Atomically updates top-level entity fields in the cached FullSubject JSON.

  KEYS[1] = FullSubject cache key (entity-specific)

  ARGV[1] = updates JSON object
  ARGV[2] = cache TTL in seconds
  ARGV[3] = current timestamp in ms

  Returns JSON:
    { "success": true, "updated_fields": ["spend_limits", "usage_alerts"] }
    or
    { "success": false, "cache_miss": true }
    or
    { "success": false, "no_entity": true }
]]

local subject_key = KEYS[1]
local updates = cjson.decode(ARGV[1])
local cache_ttl = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])

local has_updates = false
for _ in pairs(updates) do
  has_updates = true
  break
end

if not has_updates then
  return cjson.encode({ success = true, updated_fields = {} })
end

local current_raw = redis.call("GET", subject_key)
if not current_raw then
  return cjson.encode({ success = false, cache_miss = true })
end

local cached = cjson.decode(current_raw)

if not cached.entity then
  return cjson.encode({ success = false, no_entity = true })
end

local updated_fields = {}

for field_name, field_value in pairs(updates) do
  cached.entity[field_name] = field_value
  table.insert(updated_fields, field_name)
end

redis.call("SET", subject_key, cjson.encode(cached), "EX", cache_ttl)

return cjson.encode({ success = true, updated_fields = updated_fields })
