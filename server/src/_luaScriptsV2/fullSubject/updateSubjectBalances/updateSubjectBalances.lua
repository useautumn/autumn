--[[
  Lua Script: Update Subject Balances in V2 Cache (per-feature hash)

  Atomically updates SubjectBalance entries in a single per-feature
  balance hash. Each hash field is cusEntId -> JSON(SubjectBalance).

  Supports: scalar field updates, rollover operations (insert/overwrite/delete),
  replaceable operations (insert/delete), and an expected_next_reset_at guard.
  This script intentionally does not increment or overwrite cache_version.
  cache_version is owned by DB-side lifecycle/billing transitions.

  After applying updates, propagates entity-level balance/adjustment deltas
  to the _aggregated field on the same hash via update_aggregated_balances.

  Helper functions prepended via string interpolation from:
    - luaUtils.lua (safe_number, is_nil, safe_table)
    - updateContextUtils.lua (init_update_context)
    - applyFieldUpdates.lua (per-field update helpers)
    - updateAggregatedBalances.lua (shared aggregation utility)

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

local context = init_update_context({
  balance_key = balance_key,
  updates = updates,
})

local logger = context.logger
logger.log("=== UPDATE SUBJECT BALANCES START ===")
logger.log("  balance_key: %s", balance_key)
logger.log("  update_count: %d", #updates)

local applied = {}
local skipped = {}

for _, update in ipairs(updates) do
  local cus_ent_id = update.cus_ent_id
  local ent_data = context.customer_entitlements[cus_ent_id]

  if not ent_data then
    logger.log("  [%s] SKIPPED: not found in hash", cus_ent_id)
    table.insert(skipped, cus_ent_id)
  else
    local subject_balance = ent_data.subject_balance

    local should_skip = false
    if not is_nil(update.expected_next_reset_at) and update.expected_next_reset_at ~= false then
      local current = safe_number(subject_balance.next_reset_at)
      if current ~= update.expected_next_reset_at then
        logger.log("  [%s] SKIPPED: expected_next_reset_at mismatch (current=%s, expected=%s)",
          cus_ent_id, tostring(current), tostring(update.expected_next_reset_at))
        should_skip = true
      end
    end

    if should_skip then
      table.insert(skipped, cus_ent_id)
    else
      local has_entities = type(update.entities) == 'table'
      logger.log("  [%s] APPLYING: isEntityLevel=%s, balance=%s, adjustment=%s, has_entities=%s",
        cus_ent_id,
        tostring(subject_balance.isEntityLevel or false),
        tostring(update.balance),
        tostring(update.adjustment),
        tostring(has_entities))

      local helper_params = {
        subject_balance = subject_balance,
        update = update,
        context = context,
        cus_ent_id = cus_ent_id,
      }

      apply_balance_and_adjustment_update(helper_params)
      apply_entities_update(helper_params)
      apply_next_reset_at_update(helper_params)
      apply_rollover_updates(helper_params)
      apply_replaceable_updates(helper_params)

      redis.call('HSET', balance_key, cus_ent_id, cjson.encode(subject_balance))
      applied[cus_ent_id] = true
    end
  end
end

logger.log("  mutation_logs_count: %d", #context.mutation_logs)

update_aggregated_balances({
  context = context,
  mutation_logs = context.mutation_logs,
})

if ttl_seconds and ttl_seconds > 0 then
  redis.call('EXPIRE', balance_key, ttl_seconds)
end

logger.log("=== UPDATE SUBJECT BALANCES END ===")

return cjson.encode({ applied = applied, skipped = skipped, logs = context.logs })
