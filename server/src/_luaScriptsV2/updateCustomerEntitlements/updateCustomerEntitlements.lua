--[[
  Lua Script: Update Customer Entitlements in Redis Cache

  Unified script for atomically updating cached cusEnt fields after either
  a DB reset or a DB deduction. Both operations are "apply absolute values
  to customer entitlements in the Redis cache."

  Helper functions prepended via string interpolation from:
    - luaUtils.lua (find_entitlement, safe_number, is_nil, safe_table)

  KEYS[1] = FullCustomer cache key

  ARGV[1] = JSON params:
    {
      updates: [{
        cus_ent_id: string,
        balance: number | null,
        additional_balance: number | null,
        adjustment: number | null,
        entities: object | null,
        next_reset_at: number | null,
        expected_next_reset_at: number | null,
        rollover_insert: { id, cus_ent_id, balance, usage, expires_at, entities } | null,
        rollover_overwrites: [{ id, balance, usage, entities }] | null,
        rollover_delete_ids: string[] | null,
        new_replaceables: Replaceable[] | null,
        deleted_replaceable_ids: string[] | null,
      }]
    }

  Guard logic (per update item):
    When expected_next_reset_at is provided, skip the update if the cache's
    current next_reset_at differs. This prevents:
    - Reset: re-applying a reset that another request already applied
    - Deduction: overwriting fresh reset values with stale deduction data

  Returns JSON:
    { "applied": { "<cus_ent_id>": true }, "skipped": ["id1"], "cache_miss": bool }
]]

local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])
local updates = params.updates or {}

-- Early return if no updates
if #updates == 0 then
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

for _, update in ipairs(updates) do
  local ent_id = update.cus_ent_id

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

    -- Optimistic guard: skip if expected_next_reset_at is provided and
    -- the cache's current next_reset_at doesn't match
    local should_skip = false
    if not is_nil(update.expected_next_reset_at) then
      local current_reset_at = safe_number(cus_ent.next_reset_at)
      if current_reset_at ~= update.expected_next_reset_at then
        should_skip = true
      end
    end

    if should_skip then
      table.insert(skipped, ent_id)
    else
      -- ================================================================
      -- Apply scalar fields using JSON.SET for absolute values
      -- ================================================================
      if not is_nil(update.balance) then
        redis.call('JSON.SET', cache_key, base_path .. '.balance', tostring(update.balance))
      end

      if not is_nil(update.additional_balance) then
        redis.call('JSON.SET', cache_key, base_path .. '.additional_balance', tostring(update.additional_balance))
      end

      if not is_nil(update.adjustment) then
        redis.call('JSON.SET', cache_key, base_path .. '.adjustment', tostring(update.adjustment))
      end

      -- Set entities if provided (entity-scoped entitlement)
      if not is_nil(update.entities) then
        redis.call('JSON.SET', cache_key, base_path .. '.entities', cjson.encode(update.entities))
      end

      -- Set next_reset_at if provided (reset operation)
      if not is_nil(update.next_reset_at) then
        redis.call('JSON.SET', cache_key, base_path .. '.next_reset_at', tostring(update.next_reset_at))
      end

      -- ================================================================
      -- Rollover operations
      -- ================================================================

      -- APPEND a new rollover
      if not is_nil(update.rollover_insert) then
        local rollover_json = cjson.encode(update.rollover_insert)
        redis.call('JSON.ARRAPPEND', cache_key, base_path .. '.rollovers', rollover_json)
      end

      -- OVERWRITE existing rollovers by ID (absolute balance/usage/entities)
      if not is_nil(update.rollover_overwrites) then
        local rollovers_json = redis.call('JSON.GET', cache_key, base_path .. '.rollovers')
        if rollovers_json then
          local rollovers = cjson.decode(rollovers_json)

          -- Build lookup from overwrite ID -> overwrite data
          local overwrite_map = {}
          for _, ow in ipairs(update.rollover_overwrites) do
            overwrite_map[ow.id] = ow
          end

          -- Apply overwrites
          for i, rollover in ipairs(rollovers) do
            local ow = overwrite_map[rollover.id]
            if ow then
              rollovers[i].balance = ow.balance
              rollovers[i].usage = ow.usage
              if not is_nil(ow.entities) then
                rollovers[i].entities = ow.entities
              end
            end
          end

          redis.call('JSON.SET', cache_key, base_path .. '.rollovers', cjson.encode(rollovers))
        end
      end

      -- DELETE rollovers by ID
      if not is_nil(update.rollover_delete_ids) then
        local rollovers_json = redis.call('JSON.GET', cache_key, base_path .. '.rollovers')
        if rollovers_json then
          local rollovers = cjson.decode(rollovers_json)

          -- Build delete set
          local delete_set = {}
          for _, del_id in ipairs(update.rollover_delete_ids) do
            delete_set[del_id] = true
          end

          -- Filter out deleted rollovers
          local new_rollovers = {}
          for _, rollover in ipairs(rollovers) do
            if not delete_set[rollover.id] then
              table.insert(new_rollovers, rollover)
            end
          end

          redis.call('JSON.SET', cache_key, base_path .. '.rollovers', cjson.encode(new_rollovers))
        end
      end

      -- ================================================================
      -- Replaceable operations
      -- ================================================================

      -- APPEND new replaceables
      if not is_nil(update.new_replaceables) then
        for _, replaceable in ipairs(update.new_replaceables) do
          local replaceable_json = cjson.encode(replaceable)
          redis.call('JSON.ARRAPPEND', cache_key, base_path .. '.replaceables', replaceable_json)
        end
      end

      -- DELETE replaceables by ID
      if not is_nil(update.deleted_replaceable_ids) then
        local replaceables_json = redis.call('JSON.GET', cache_key, base_path .. '.replaceables')
        if replaceables_json then
          local replaceables = cjson.decode(replaceables_json)

          -- Build delete set
          local delete_set = {}
          for _, del_id in ipairs(update.deleted_replaceable_ids) do
            delete_set[del_id] = true
          end

          -- Filter out deleted replaceables
          local new_replaceables = {}
          for _, replaceable in ipairs(replaceables) do
            if not delete_set[replaceable.id] then
              table.insert(new_replaceables, replaceable)
            end
          end

          redis.call('JSON.SET', cache_key, base_path .. '.replaceables', cjson.encode(new_replaceables))
        end
      end

      applied[ent_id] = true
    end
  end
end

return cjson.encode({ applied = applied, skipped = skipped })
