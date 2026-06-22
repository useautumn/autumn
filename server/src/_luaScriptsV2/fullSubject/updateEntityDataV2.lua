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

if updates.usage_limits ~= nil then
  local seen_feature_ids = {}
  local usage_window_feature_ids = {}

  local function append_usage_limit_feature_ids(usage_limits)
    if type(usage_limits) ~= 'table' then
      return
    end

    for _, usage_limit in ipairs(usage_limits) do
      if type(usage_limit) == 'table' and usage_limit.feature_id ~= nil then
        local feature_id = usage_limit.feature_id
        if seen_feature_ids[feature_id] == nil then
          seen_feature_ids[feature_id] = true
          table.insert(usage_window_feature_ids, feature_id)
        end
      end
    end
  end

  if cached.customer ~= nil then
    append_usage_limit_feature_ids(cached.customer.usage_limits)
  end
  append_usage_limit_feature_ids(cached.entity.usage_limits)

  cached.usageWindowFeatureIds = usage_window_feature_ids
end

redis.call("SET", subject_key, cjson.encode(cached), "EX", cache_ttl)

return cjson.encode({ success = true, updated_fields = updated_fields })
