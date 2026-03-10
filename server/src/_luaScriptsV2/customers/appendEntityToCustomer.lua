--[[
  Lua Script: Upsert Entity in Customer Cache

  Atomically upserts an entity in the customer's entities array:
  - If entity with same internal_id exists: update id and name if different
  - If entity with same id exists (but different internal_id): skip (already exists)
  - Otherwise: append the new entity

  CRDT Safety Note (Active-Active Redis):
  - JSON.ARRAPPEND follows "Update versus update array" conflict resolution
  - Resolution type: Merge - results from all instances are merged
  - JSON.SET on specific paths follows "Update versus update" (smallest instance ID wins)

  KEYS[1] = FullCustomer cache key

  ARGV[1] = JSON-encoded entity object

  Returns JSON:
    { "success": true, "action": "appended" }   - Entity was appended
    { "success": true, "action": "updated" }    - Entity was updated (same internal_id)
    { "success": true, "action": "skipped", "reason": "already_exists" } - Entity with same id exists
    { "success": false, "cache_miss": true }    - Customer not in cache
]]

local cache_key = KEYS[1]
local entity_json = ARGV[1]

-- Check if cache exists
local key_exists = redis.call('EXISTS', cache_key)
if key_exists == 0 then
  return cjson.encode({ success = false, cache_miss = true })
end

-- Parse the incoming entity
local entity = cjson.decode(entity_json)
local entity_id = entity.id
local entity_internal_id = entity.internal_id
local entity_name = entity.name

-- Get current entities array
local entities_json = redis.call('JSON.GET', cache_key, '$.entities')
if not entities_json then
  -- entities array doesn't exist, create it with the new entity
  redis.call('JSON.SET', cache_key, '$.entities', cjson.encode({entity}))
  return cjson.encode({ success = true, action = "appended" })
end

-- Parse entities array (JSON.GET with JSONPath returns array of results)
local entities_wrapper = cjson.decode(entities_json)
local entities = entities_wrapper[1] or {}

-- Search for existing entity by internal_id or id
for idx, existing_entity in ipairs(entities) do
  -- Check if same internal_id (this is the "replace" case - update id/name)
  if existing_entity.internal_id == entity_internal_id then
    local updated = false
    local array_idx = idx - 1  -- JSON arrays are 0-indexed

    -- Update id if different
    if existing_entity.id ~= entity_id then
      redis.call('JSON.SET', cache_key, '$.entities[' .. array_idx .. '].id', cjson.encode(entity_id))
      updated = true
    end

    -- Update name if different
    if existing_entity.name ~= entity_name then
      redis.call('JSON.SET', cache_key, '$.entities[' .. array_idx .. '].name', cjson.encode(entity_name))
      updated = true
    end

    if updated then
      return cjson.encode({ success = true, action = "updated" })
    else
      return cjson.encode({ success = true, action = "skipped", reason = "no_changes" })
    end
  end

  -- Check if same id (but different internal_id) - entity already exists
  if existing_entity.id == entity_id then
    return cjson.encode({ success = true, action = "skipped", reason = "already_exists" })
  end
end

-- No matching entity found, append the new one
redis.call('JSON.ARRAPPEND', cache_key, '$.entities', entity_json)

return cjson.encode({ success = true, action = "appended" })
