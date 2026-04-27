--[[
  Lua Script: Adjust Subject Balance in V2 Cache (single entitlement)

  Atomically increments/decrements one SubjectBalance.balance entry in a single
  per-feature hash. The hash field is cusEntId -> JSON(SubjectBalance).

  Uses shared helper composition from:
    - luaUtils.lua (safe_number, safe_decode, is_nil)
    - updateContextUtils.lua (init_update_context)
    - updateAggregatedBalances.lua (entity-level aggregate propagation)

  KEYS[1] = balance hash key
            e.g. {customerId}:orgId:env:full_subject:shared_balances:{featureId}

  ARGV[1] = JSON params:
    {
      cus_ent_id: string,
      delta: number,
      ttl_seconds: number | null
    }

  Returns JSON:
    { ok: true, new_balance: number, new_cache_version: number } |
    { ok: false, error: string }
]]

local balance_key = KEYS[1]
local params = cjson.decode(ARGV[1] or "{}")

local customer_entitlement_id = params.cus_ent_id
local delta = tonumber(params.delta)
local ttl_seconds = tonumber(params.ttl_seconds)

if not customer_entitlement_id or delta == nil then
  return cjson.encode({ ok = false, error = "missing cus_ent_id or delta" })
end

if redis.call("EXISTS", balance_key) == 0 then
  return cjson.encode({ ok = false, error = "cache_miss" })
end

local context = init_update_context({
  balance_key = balance_key,
  updates = {
    { cus_ent_id = customer_entitlement_id }
  },
})

local entitlement_data = context.customer_entitlements[customer_entitlement_id]
if not entitlement_data then
  return cjson.encode({ ok = false, error = "cus_ent_not_found" })
end

local subject_balance = entitlement_data.subject_balance
local previous_balance = safe_number(subject_balance.balance)
local next_balance = previous_balance + delta
subject_balance.balance = next_balance

-- Legacy-compatibility exception:
-- Keep FullSubject cache_version aligned with DB increment/decrement flows
-- used by adjustBalanceDbAndCache. This is reviewable behavior, not a
-- general pattern for all runtime cache patch scripts.
local previous_cache_version = safe_number(subject_balance.cache_version)
subject_balance.cache_version = previous_cache_version + 1

if subject_balance.isEntityLevel then
  local entity_id = subject_balance.internal_entity_id
  if is_nil(entity_id) then entity_id = cjson.null end

  table.insert(context.mutation_logs, {
    target_type = "customer_entitlement",
    customer_entitlement_id = customer_entitlement_id,
    entity_id = entity_id,
    balance_delta = delta,
    adjustment_delta = 0,
  })
end

redis.call("HSET", balance_key, customer_entitlement_id, cjson.encode(subject_balance))

update_aggregated_balances({
  context = context,
  mutation_logs = context.mutation_logs,
})

if ttl_seconds and ttl_seconds > 0 then
  redis.call("EXPIRE", balance_key, ttl_seconds)
end

return cjson.encode({
  ok = true,
  new_balance = next_balance,
  new_cache_version = subject_balance.cache_version
})
