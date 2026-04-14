--[[
  Lua Script: Update Subject Balances in V2 Cache (per-feature hash)

  Atomically updates SubjectBalance entries in a single per-feature
  balance hash. Each hash field is cusEntId → JSON(SubjectBalance).

  Supports: scalar field updates, rollover operations (insert/overwrite/delete),
  replaceable operations (insert/delete), and an expected_next_reset_at guard.

  Helper functions prepended via string interpolation from:
    - luaUtils.lua (safe_number, is_nil, safe_table)

  KEYS[1] = balance hash key
            e.g. {customerId}:orgId:env:full_subject:shared_balances:{featureId}

  ARGV[1] = JSON params:
    {
      ttl_seconds: number,
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

  Returns JSON:
    { "applied": { "<cus_ent_id>": true }, "skipped": ["id1"] }
]]

local balance_key = KEYS[1]
local params = cjson.decode(ARGV[1])
local updates = params.updates or {}
local ttl_seconds = params.ttl_seconds

if #updates == 0 then
  return cjson.encode({ applied = {}, skipped = {} })
end

local applied = {}
local skipped = {}

for _, update in ipairs(updates) do
  local cus_ent_id = update.cus_ent_id

  -- Read the SubjectBalance from the hash field
  local raw = redis.call('HGET', balance_key, cus_ent_id)
  if not raw then
    table.insert(skipped, cus_ent_id)
  else
    local subject_balance = cjson.decode(raw)

    -- Optimistic guard: skip if expected_next_reset_at doesn't match
    local should_skip = false
    if not is_nil(update.expected_next_reset_at) then
      local current_reset_at = safe_number(subject_balance.next_reset_at)
      if current_reset_at ~= update.expected_next_reset_at then
        should_skip = true
      end
    end

    if should_skip then
      table.insert(skipped, cus_ent_id)
    else
      -- ================================================================
      -- Apply scalar field updates
      -- ================================================================
      if not is_nil(update.balance) then
        subject_balance.balance = update.balance
      end

      if not is_nil(update.additional_balance) then
        subject_balance.additional_balance = update.additional_balance
      end

      if not is_nil(update.adjustment) then
        subject_balance.adjustment = update.adjustment
      end

      if not is_nil(update.entities) then
        subject_balance.entities = update.entities
      end

      if not is_nil(update.next_reset_at) then
        subject_balance.next_reset_at = update.next_reset_at
      end

      -- ================================================================
      -- Rollover operations
      -- ================================================================

      -- Ensure rollovers array exists
      subject_balance.rollovers = safe_table(subject_balance.rollovers)

      -- APPEND a new rollover
      if not is_nil(update.rollover_insert) then
        table.insert(subject_balance.rollovers, update.rollover_insert)
      end

      -- OVERWRITE existing rollovers by ID
      if not is_nil(update.rollover_overwrites) then
        local overwrite_map = {}
        for _, ow in ipairs(update.rollover_overwrites) do
          overwrite_map[ow.id] = ow
        end

        for i, rollover in ipairs(subject_balance.rollovers) do
          local ow = overwrite_map[rollover.id]
          if ow then
            subject_balance.rollovers[i].balance = ow.balance
            subject_balance.rollovers[i].usage = ow.usage
            if not is_nil(ow.entities) then
              subject_balance.rollovers[i].entities = ow.entities
            end
          end
        end
      end

      -- DELETE rollovers by ID
      if not is_nil(update.rollover_delete_ids) then
        local delete_set = {}
        for _, del_id in ipairs(update.rollover_delete_ids) do
          delete_set[del_id] = true
        end

        local new_rollovers = {}
        for _, rollover in ipairs(subject_balance.rollovers) do
          if not delete_set[rollover.id] then
            table.insert(new_rollovers, rollover)
          end
        end
        subject_balance.rollovers = new_rollovers
      end

      -- ================================================================
      -- Replaceable operations
      -- ================================================================

      -- APPEND new replaceables
      if not is_nil(update.new_replaceables) then
        subject_balance.replaceables = safe_table(subject_balance.replaceables)
        for _, replaceable in ipairs(update.new_replaceables) do
          table.insert(subject_balance.replaceables, replaceable)
        end
      end

      -- DELETE replaceables by ID
      if not is_nil(update.deleted_replaceable_ids) then
        if not is_nil(subject_balance.replaceables) then
          local delete_set = {}
          for _, del_id in ipairs(update.deleted_replaceable_ids) do
            delete_set[del_id] = true
          end

          local new_replaceables = {}
          for _, replaceable in ipairs(subject_balance.replaceables) do
            if not delete_set[replaceable.id] then
              table.insert(new_replaceables, replaceable)
            end
          end
          subject_balance.replaceables = new_replaceables
        end
      end

      -- Write back the updated SubjectBalance
      redis.call('HSET', balance_key, cus_ent_id, cjson.encode(subject_balance))
      applied[cus_ent_id] = true
    end
  end
end

-- Refresh TTL on the hash key
if ttl_seconds and ttl_seconds > 0 then
  redis.call('EXPIRE', balance_key, ttl_seconds)
end

return cjson.encode({ applied = applied, skipped = skipped })
