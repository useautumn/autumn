--[[
  Lua Script: Destructive-read shared balance fields (GETDEL semantics)

  Atomically reads customer-entitlement balance fields and deletes them, so an
  invalidation cannot race a deduction between the read and the delete. The
  returned values are flushed to Postgres by the caller before the subject
  view is unlinked.

  KEYS = shared balance hash keys (one per feature, same {customerId} slot)

  ARGV[1] = JSON array aligned with KEYS: per-key array of cusEnt field names
  ARGV[2] = JSON array of field names to delete from every key without
            returning (derived fields, e.g. _aggregated / _usage_windows)

  Returns JSON: array aligned with KEYS of per-key value arrays
  (null where the field was missing)
]]

local cus_ent_fields_by_key = cjson.decode(ARGV[1])
local delete_only_fields = cjson.decode(ARGV[2])

local values_by_key = {}

for key_index, balance_key in ipairs(KEYS) do
  local cus_ent_fields = cus_ent_fields_by_key[key_index]
  if type(cus_ent_fields) ~= "table" then
    cus_ent_fields = {}
  end

  local values = {}
  if #cus_ent_fields > 0 then
    local raw_values = redis.call("HMGET", balance_key, unpack(cus_ent_fields))
    for value_index = 1, #cus_ent_fields do
      values[value_index] = raw_values[value_index] or cjson.null
    end
  end

  local fields_to_delete = {}
  for _, field_name in ipairs(cus_ent_fields) do
    table.insert(fields_to_delete, field_name)
  end
  for _, field_name in ipairs(delete_only_fields) do
    table.insert(fields_to_delete, field_name)
  end
  if #fields_to_delete > 0 then
    redis.call("HDEL", balance_key, unpack(fields_to_delete))
  end

  values_by_key[key_index] = values
end

return cjson.encode(values_by_key)
