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
        auto_topups?: array | null,
        spend_limits?: array | null,
        usage_alerts?: array | null,
        overage_allowed?: array | null,
        config?: object | null
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

if not is_nil(updates.name) then
  redis.call('JSON.SET', cache_key, '$.name', cjson.encode(updates.name))
  table.insert(updated_fields, 'name')
end

if not is_nil(updates.email) then
  redis.call('JSON.SET', cache_key, '$.email', cjson.encode(updates.email))
  table.insert(updated_fields, 'email')
end

if not is_nil(updates.fingerprint) then
  redis.call('JSON.SET', cache_key, '$.fingerprint', cjson.encode(updates.fingerprint))
  table.insert(updated_fields, 'fingerprint')
end

if not is_nil(updates.send_email_receipts) then
  local bool_val = 'false'
  if updates.send_email_receipts == true then
    bool_val = 'true'
  end
  redis.call('JSON.SET', cache_key, '$.send_email_receipts', bool_val)
  table.insert(updated_fields, 'send_email_receipts')
end

if not is_nil(updates.metadata) then
  redis.call('JSON.SET', cache_key, '$.metadata', cjson.encode(updates.metadata))
  table.insert(updated_fields, 'metadata')
end

if not is_nil(updates.processor) then
  redis.call('JSON.SET', cache_key, '$.processor', cjson.encode(updates.processor))
  table.insert(updated_fields, 'processor')
end

if not is_nil(updates.processors) then
  redis.call('JSON.SET', cache_key, '$.processors', cjson.encode(updates.processors))
  table.insert(updated_fields, 'processors')
end

if updates.auto_topups ~= nil then
  if is_nil(updates.auto_topups) then
    redis.call('JSON.SET', cache_key, '$.auto_topups', 'null')
  else
    redis.call('JSON.SET', cache_key, '$.auto_topups', cjson.encode(updates.auto_topups))
  end
  table.insert(updated_fields, 'auto_topups')
end

if updates.spend_limits ~= nil then
  if is_nil(updates.spend_limits) then
    redis.call('JSON.SET', cache_key, '$.spend_limits', 'null')
  else
    redis.call('JSON.SET', cache_key, '$.spend_limits', cjson.encode(updates.spend_limits))
  end
  table.insert(updated_fields, 'spend_limits')
end

if updates.usage_alerts ~= nil then
  if is_nil(updates.usage_alerts) then
    redis.call('JSON.SET', cache_key, '$.usage_alerts', 'null')
  else
    redis.call('JSON.SET', cache_key, '$.usage_alerts', cjson.encode(updates.usage_alerts))
  end
  table.insert(updated_fields, 'usage_alerts')
end

if updates.overage_allowed ~= nil then
  if is_nil(updates.overage_allowed) then
    redis.call('JSON.SET', cache_key, '$.overage_allowed', 'null')
  else
    redis.call('JSON.SET', cache_key, '$.overage_allowed', cjson.encode(updates.overage_allowed))
  end
  table.insert(updated_fields, 'overage_allowed')
end

if updates.config ~= nil then
  if is_nil(updates.config) then
    redis.call('JSON.SET', cache_key, '$.config', 'null')
  else
    redis.call('JSON.SET', cache_key, '$.config', cjson.encode(updates.config))
  end
  table.insert(updated_fields, 'config')
end

return cjson.encode({ success = true, updated_fields = updated_fields })
