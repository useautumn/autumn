--[[
  Lua Script: Update Customer Data in Redis Cache

  Atomically updates top-level customer fields (name, email, metadata, etc.)
  in the cached FullCustomer JSON object.

  KEYS[1] = FullCustomer cache key

  ARGV[1] = JSON params:
    {
      updates: {
        name?: string | null,
        email?: string | null,
        fingerprint?: string | null,
        metadata?: object | null,
        send_email_receipts?: boolean | null,
        processor?: object | null,
        processors?: object | null,
        auto_topup?: array | null
      }
    }

  Returns JSON:
    { "success": true, "updated_fields": ["name", "email", ...] }
    or
    { "success": false, "cache_miss": true }
]]

local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])
local updates = params.updates or {}

-- Check if any updates provided
local has_updates = false
for _ in pairs(updates) do
  has_updates = true
  break
end

if not has_updates then
  return cjson.encode({ success = true, updated_fields = {} })
end

-- Check if cache exists
local key_exists = redis.call('EXISTS', cache_key)
if key_exists == 0 then
  return cjson.encode({ success = false, cache_miss = true })
end

local updated_fields = {}

-- Update each field if provided (not nil and not cjson.null)
-- For scalar fields (string, boolean, number), use JSON.SET with the value
-- For object fields (metadata, processor, processors), encode as JSON

if updates.name ~= nil and updates.name ~= cjson.null then
  redis.call('JSON.SET', cache_key, '$.name', cjson.encode(updates.name))
  table.insert(updated_fields, 'name')
end

if updates.email ~= nil and updates.email ~= cjson.null then
  redis.call('JSON.SET', cache_key, '$.email', cjson.encode(updates.email))
  table.insert(updated_fields, 'email')
end

if updates.fingerprint ~= nil and updates.fingerprint ~= cjson.null then
  redis.call('JSON.SET', cache_key, '$.fingerprint', cjson.encode(updates.fingerprint))
  table.insert(updated_fields, 'fingerprint')
end

if updates.send_email_receipts ~= nil and updates.send_email_receipts ~= cjson.null then
  local bool_val = 'false'
  if updates.send_email_receipts == true then
    bool_val = 'true'
  end
  redis.call('JSON.SET', cache_key, '$.send_email_receipts', bool_val)
  table.insert(updated_fields, 'send_email_receipts')
end

if updates.metadata ~= nil and updates.metadata ~= cjson.null then
  redis.call('JSON.SET', cache_key, '$.metadata', cjson.encode(updates.metadata))
  table.insert(updated_fields, 'metadata')
end

if updates.processor ~= nil and updates.processor ~= cjson.null then
  redis.call('JSON.SET', cache_key, '$.processor', cjson.encode(updates.processor))
  table.insert(updated_fields, 'processor')
end

if updates.processors ~= nil and updates.processors ~= cjson.null then
  redis.call('JSON.SET', cache_key, '$.processors', cjson.encode(updates.processors))
  table.insert(updated_fields, 'processors')
end

if updates.auto_topup ~= nil then
  if updates.auto_topup == cjson.null then
    redis.call('JSON.SET', cache_key, '$.auto_topup', 'null')
  else
    redis.call('JSON.SET', cache_key, '$.auto_topup', cjson.encode(updates.auto_topup))
  end
  table.insert(updated_fields, 'auto_topup')
end

return cjson.encode({ success = true, updated_fields = updated_fields })
