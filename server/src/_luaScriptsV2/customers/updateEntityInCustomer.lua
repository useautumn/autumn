--[[
  Lua Script: Update Entity Fields in Cached FullCustomer

  Atomically updates specific fields on an entity inside the cached
  FullCustomer JSON object. Matches by entity id or internal_id.

  KEYS[1] = FullCustomer cache key

  ARGV[1] = JSON:
    {
      id_or_internal_id: string,
      updates: { field: value, ... }
    }

  Returns JSON:
    { "ok": true, "updated_count": number }
    { "ok": false, "error": string }
]]

local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])

local id_or_internal_id = params.id_or_internal_id
local updates = params.updates

if not id_or_internal_id then
  return cjson.encode({ ok = false, error = "missing_id_or_internal_id" })
end

if not updates then
  return cjson.encode({ ok = false, error = "missing_updates" })
end

local raw = redis.call('JSON.GET', cache_key, '.')
if not raw then
  return cjson.encode({ ok = false, error = "cache_miss" })
end

local full_customer = cjson.decode(raw)

if full_customer.entities == nil then
  return cjson.encode({ ok = false, error = "no_entities" })
end

if #full_customer.entities == 0 then
  return cjson.encode({ ok = false, error = "empty_entities" })
end

local entity_idx = nil
for idx, entity in ipairs(full_customer.entities) do
  if entity.id == id_or_internal_id or entity.internal_id == id_or_internal_id then
    entity_idx = idx - 1
    break
  end
end

if entity_idx == nil then
  return cjson.encode({ ok = false, error = "entity_not_found" })
end

local base_path = '$.entities[' .. entity_idx .. '].'
local updated_count = 0

for field, value in pairs(updates) do
  if value == cjson.null then
    redis.call('JSON.SET', cache_key, base_path .. field, 'null')
  else
    redis.call('JSON.SET', cache_key, base_path .. field, cjson.encode(value))
  end
  updated_count = updated_count + 1
end

return cjson.encode({ ok = true, updated_count = updated_count })
