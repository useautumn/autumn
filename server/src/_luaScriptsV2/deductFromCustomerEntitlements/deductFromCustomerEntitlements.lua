--[[
  Lua Script: Deduct from Customer Entitlements in Redis

  Uses JSON.NUMINCRBY for atomic incremental updates.
  Reads CURRENT balance from Redis before each calculation to avoid stale reads.

  Deduction Order (mirrors SQL performDeduction.sql):
    1. Deduct from rollovers first (oldest first by expires_at)
    2. Pass 1: Deduct from main balance (floor at 0)
    3. Pass 2: Allow negative if usage_allowed

  Helper functions are prepended via string interpolation from:
    - fullCustomerKeyBuilders.lua (build_path_index_key, etc.)
    - luaUtils.lua (safe_table, safe_number, sorted_keys, is_nil)
    - fullCustomerUtils.lua (find_entitlement, find_entitlement_from_index, build_entity_path, etc.)
    - readBalances.lua (read_current_balance, read_current_entity_balance, read_current_entities, read_rollover_data)
    - contextUtils.lua (init_context, queue_balance_update, apply_pending_writes)
    - deductFromRollovers.lua (deduct_from_rollovers)
    - deductFromMainBalance.lua (calculate_change, deduct_from_main_balance)
    - getTotalBalance.lua (get_total_balance)

  KEYS[1] = FullCustomer cache key (used for cluster slot routing)

  ARGV[1] = JSON params:
    {
      org_id: string,
      env: string,
      customer_id: string,
      sorted_entitlements: [{ customer_entitlement_id, credit_cost, feature_id, entity_feature_id, usage_allowed, min_balance, max_balance }],
      spend_limit_by_feature_id: { [feature_id]: { feature_id, enabled, overage_limit } } | null,
      usage_based_cus_ent_ids_by_feature_id: { [feature_id]: string[] } | null,
      amount_to_deduct: number | null,
      target_balance: number | null,
      target_entity_id: string | nil,
      rollovers: { id: string, credit_cost: number }[] | nil,
      cus_ent_ids: string[] | nil,
      skip_additional_balance: boolean,
      alter_granted_balance: boolean,
      overage_behaviour: "cap" | "reject" | "allow",
      feature_id: string
    }

  Returns JSON:
    {
      updates: { [cus_ent_id]: { balance, additional_balance, adjustment, entities, deducted, additional_deducted } },
      rollover_updates: { [rollover_id]: { balance, usage, entities } },
      remaining: number,
      error: string | null,
      feature_id: string | null
    }
]]

-- ============================================================================
-- MAIN SCRIPT
-- ============================================================================
local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])

-- Extract org/env/customer for path index key construction
local org_id = params.org_id
local env = params.env
local customer_id = params.customer_id

-- Extract parameters
local sorted_entitlements = params.sorted_entitlements or {}
local spend_limit_by_feature_id = params.spend_limit_by_feature_id
local usage_based_cus_ent_ids_by_feature_id = params.usage_based_cus_ent_ids_by_feature_id
local amount_to_deduct = params.amount_to_deduct
local target_balance = params.target_balance
local target_entity_id = params.target_entity_id
local rollovers = params.rollovers
local skip_additional_balance = params.skip_additional_balance or false
local alter_granted_balance = params.alter_granted_balance or false
local overage_behaviour = params.overage_behaviour or 'cap'
local feature_id = params.feature_id
local lock = params.lock
local unwind_value = params.unwind_value
local lock_receipt_key = params.lock_receipt_key

-- Compute overage_behavior_is_allow once
local overage_behavior_is_allow = alter_granted_balance or overage_behaviour == 'allow'

local empty_logs = cjson.decode('[]')

-- Check if customer exists
local key_exists = redis.call('EXISTS', cache_key)
if key_exists == 0 then
  return cjson.encode({ error = 'CUSTOMER_NOT_FOUND', updates = {}, rollover_updates = {}, mutation_logs = empty_logs, remaining = 0 })
end

-- Build path index key and check existence (fast path vs fallback)
local pathidx_key = build_path_index_key(org_id, env, customer_id)
local has_pathidx = redis.call('EXISTS', pathidx_key) == 1

-- Only decode full customer if path index is NOT available (fallback)
local full_customer = nil
if not has_pathidx then
  local full_customer_json = redis.call('JSON.GET', cache_key, '.')
  if not full_customer_json then
    return cjson.encode({ error = 'CUSTOMER_NOT_FOUND', updates = {}, rollover_updates = {}, mutation_logs = empty_logs, remaining = 0 })
  end

  full_customer = cjson.decode(full_customer_json)

  if not full_customer.customer_products then
    return cjson.encode({
      error = 'NO_CUSTOMER_PRODUCTS',
      updates = {},
      rollover_updates = {},
      mutation_logs = empty_logs,
      remaining = 0
    })
  end
end

-- Initialize context with in-memory state from Redis
local customer_entitlement_ids = {}
for _, ent_obj in ipairs(sorted_entitlements) do
  table.insert(customer_entitlement_ids, ent_obj.customer_entitlement_id)
end

local context = init_context({
  cache_key = cache_key,
  customer_entitlement_ids = customer_entitlement_ids,
  full_customer = full_customer,
  pathidx_key = pathidx_key,
  has_pathidx = has_pathidx,
})

local unwind_modified_cus_ent_ids = {}

if not is_nil(unwind_value) and safe_number(unwind_value) > 0 then
  local unwind_result = unwind_lock_on_context({
    context = context,
    lock_receipt_key = lock_receipt_key,
    unwind_value = unwind_value,
  })

  if not is_nil(unwind_result.error) then
    return cjson.encode({
      error = unwind_result.error,
      updates = {},
      rollover_updates = {},
      mutation_logs = context.mutation_logs or cjson.decode('[]'),
      remaining = 0,
      logs = context.logs,
    })
  end

  -- Track which entitlements the unwind touched so the caller can sync them.
  unwind_modified_cus_ent_ids = unwind_result.modified_customer_entitlement_ids or {}

  -- Fold any skipped unwind (missing entitlements/rollovers) into amount_to_deduct
  -- so the forward pass compensates against current live entitlements.
  local skipped = unwind_result.remaining_signed_unwind_value or 0
  if skipped ~= 0 then
    amount_to_deduct = safe_number(amount_to_deduct or 0) + skipped
  end
end

local logger = context.logger
logger.log("=== LUA DEDUCTION START ===")
logger.log("=== PARAMS ===")
logger.log("  amount_to_deduct: %s", tostring(amount_to_deduct or "nil"))
logger.log("  target_balance: %s", tostring(target_balance or "nil"))
logger.log("  alter_granted_balance: %s", tostring(alter_granted_balance or false))
logger.log("  target_entity_id: %s", tostring(target_entity_id or "nil"))
logger.log("  overage_behaviour: %s", tostring(overage_behaviour or "nil"))
local deduction_result = run_deduction_on_context({
  context = context,
  sorted_entitlements = sorted_entitlements,
  spend_limit_by_feature_id = spend_limit_by_feature_id,
  usage_based_cus_ent_ids_by_feature_id = usage_based_cus_ent_ids_by_feature_id,
  rollovers = rollovers,
  amount_to_deduct = amount_to_deduct,
  target_balance = target_balance,
  target_entity_id = target_entity_id,
  alter_granted_balance = alter_granted_balance,
  overage_behaviour = overage_behaviour,
})

local updates = deduction_result.updates
local rollover_updates = deduction_result.rollover_updates
local remaining_amount = deduction_result.remaining_amount

-- Inject unwind-only touched entitlements into updates so TypeScript can
-- sync their new balances. The forward deduction may not have touched them.
for _, cus_ent_id in ipairs(unwind_modified_cus_ent_ids) do
  if is_nil(updates[cus_ent_id]) then
    local ent_data = context.customer_entitlements[cus_ent_id]
    if ent_data then
      updates[cus_ent_id] = {
        balance = ent_data.balance or 0,
        additional_balance = 0,
        adjustment = ent_data.adjustment or 0,
        entities = ent_data.entities or {},
        deducted = 0,
      }
    end
  end
end

logger.log("  remaining_amount: %s", tostring(remaining_amount or "nil"))
logger.log("  is_refund: %s", tostring(remaining_amount < 0 or false))
local mutation_logs = context.mutation_logs
if type(mutation_logs) ~= 'table' or #mutation_logs == 0 then
  mutation_logs = cjson.decode('[]')
end
-- Throw error and don't apply updates if we're in reject mode and there's still remaining amount
if remaining_amount > 0 and overage_behaviour == 'reject' then
  return cjson.encode({
    error = 'INSUFFICIENT_BALANCE',
    feature_id = feature_id,
    remaining = remaining_amount,
    updates = {},
    mutation_logs = mutation_logs,
    logs = context.logs
  })
end

if not is_nil(lock)
    and not is_nil(lock.enabled)
    and lock.enabled
    and not is_nil(lock.redis_receipt_key)
then
  -- Check if lock receipt already exists; if so, reject without applying writes
  local existing_receipt = nil
  if redis.call('EXISTS', lock.redis_receipt_key) == 1 then
    existing_receipt = load_lock_receipt(lock.redis_receipt_key)
  end
  if not is_nil(existing_receipt) then
    return cjson.encode({
      error = 'LOCK_ALREADY_EXISTS',
      feature_id = feature_id,
      remaining = 0,
      updates = {},
      rollover_updates = rollover_updates,
      mutation_logs = mutation_logs,
      logs = context.logs
    })
  end

  save_lock_receipt_from_updates({
    lock_receipt_key = lock.redis_receipt_key,
    receipt = {
      lock_id = lock.lock_id or cjson.null,
      hashed_key = lock.hashed_key or cjson.null,
      status = 'pending',
      region = lock.region or cjson.null,
      customer_id = customer_id or cjson.null,
      feature_id = feature_id or cjson.null,
      entity_id = target_entity_id or cjson.null,
      expires_at = lock.expires_at or cjson.null,
      created_at = lock.created_at or cjson.null,
    },
    mutation_logs = mutation_logs,
    ttl_at = lock.ttl_at or cjson.null,
  })
end

-- Apply all pending writes to Redis (only after validation passes)
apply_pending_writes(cache_key, context)

logger.log("=== LUA DEDUCTION END ===")

return cjson.encode({
  updates = updates,
  rollover_updates = rollover_updates,
  mutation_logs = mutation_logs,
  remaining = remaining_amount,
  error = cjson.null,
  logs = context.logs
})
