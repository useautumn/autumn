--[[
  Lua Script: Reset Customer Entitlements in Redis Cache

  Atomically updates cached cusEnt fields after a DB reset.
  Skips if cache doesn't exist or if the cusEnt's next_reset_at already
  equals the new value (same optimistic guard as the SQL function).

  Helper functions prepended via string interpolation from:
    - luaUtils.lua (find_entitlement, safe_number, is_nil)

  KEYS[1] = FullCustomer cache key

  ARGV[1] = JSON params:
    {
      resets: [{
        cus_ent_id: string,
        balance: number | null,
        additional_balance: number | null,
        adjustment: number,
        entities: object | null,
        next_reset_at: number,
        rollover_insert: { id, cus_ent_id, balance, usage, expires_at, entities } | null
      }]
    }

  Returns JSON:
    { "applied": { "<cus_ent_id>": true }, "skipped": ["id1"] }
]]

local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])
local resets = params.resets or {}

-- Early return if no resets
if #resets == 0 then
  return cjson.encode({ applied = {}, skipped = {} })
end

-- Check if cache exists
local key_exists = redis.call('EXISTS', cache_key)
if key_exists == 0 then
  return cjson.encode({ applied = {}, skipped = {}, cache_miss = true })
end

-- Read the full customer structure for entitlement path lookups
local full_customer_json = redis.call('JSON.GET', cache_key, '.')
if not full_customer_json then
  return cjson.encode({ applied = {}, skipped = {}, cache_miss = true })
end

local full_customer = cjson.decode(full_customer_json)

local applied = {}
local skipped = {}

for _, reset in ipairs(resets) do
  local ent_id = reset.cus_ent_id
  local new_next_reset_at = reset.next_reset_at

  -- Find the cusEnt in the FullCustomer structure
  local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)

  if not cus_ent then
    table.insert(skipped, ent_id)
  else
    -- Build the JSON path to this cusEnt
    local base_path
    local is_loose = (cp_idx == nil)

    if is_loose then
      base_path = '$.extra_customer_entitlements[' .. (ce_idx - 1) .. ']'
    else
      base_path = '$.customer_products[' .. (cp_idx - 1) .. '].customer_entitlements[' .. (ce_idx - 1) .. ']'
    end

    -- Optimistic guard: skip if next_reset_at already equals the new value
    local current_reset_at = safe_number(cus_ent.next_reset_at)
    if current_reset_at == new_next_reset_at then
      table.insert(skipped, ent_id)
    else
      -- Apply reset fields using JSON.SET for absolute values
      if not is_nil(reset.balance) then
        redis.call('JSON.SET', cache_key, base_path .. '.balance', tostring(reset.balance))
      end

      if not is_nil(reset.additional_balance) then
        redis.call('JSON.SET', cache_key, base_path .. '.additional_balance', tostring(reset.additional_balance))
      end

      redis.call('JSON.SET', cache_key, base_path .. '.adjustment', tostring(reset.adjustment))
      redis.call('JSON.SET', cache_key, base_path .. '.next_reset_at', tostring(new_next_reset_at))

      -- Set entities if provided (entity-scoped entitlement)
      if not is_nil(reset.entities) then
        redis.call('JSON.SET', cache_key, base_path .. '.entities', cjson.encode(reset.entities))
      end

      -- Increment cache_version
      redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.cache_version', 1)

      -- Append rollover if provided
      if not is_nil(reset.rollover_insert) then
        local rollover_json = cjson.encode(reset.rollover_insert)
        redis.call('JSON.ARRAPPEND', cache_key, base_path .. '.rollovers', rollover_json)
      end

      applied[ent_id] = true
    end
  end
end

return cjson.encode({ applied = applied, skipped = skipped })
