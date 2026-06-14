--[[
  Lua Script: Deduct from Subject Balances in Redis

  Reads shared SubjectBalance payloads from per-feature Redis hashes and
  writes back only the touched customer_entitlement fields.

  Deduction Order (mirrors SQL performDeduction.sql):
    1. Deduct from rollovers first (oldest first by expires_at)
    2. Pass 1: Deduct from main balance (floor at 0)
    3. Pass 2: Allow negative if usage_allowed

  Helper functions are prepended via string interpolation from:
    - luaUtils.lua (safe_table, safe_number, sorted_keys, is_nil)
    - readSubjectBalances.lua
    - contextUtilsV2.lua
    - deductFromRolloversV2.lua
    - deductFromMainBalanceV2.lua
    - getTotalBalance.lua

  KEYS[1] = shared balance routing key (used for cluster slot routing)
  KEYS[2] = lock receipt key, or "" when no lock is in play
  KEYS[3] = idempotency key, or "" when the request is not idempotent
  KEYS[4..N] = per-feature shared balance hash keys; params.balance_key_index_by_feature_id
              maps feature_id → the index (4..N) of the key for that feature

  All Redis keys the script touches MUST be declared in KEYS[] so Upstash (and
  Redis Cluster) can apply key-based locking / slot routing. Do not reconstruct
  keys from ARGV inside the script.

  ARGV[1] = JSON params:
    {
      org_id: string,
      env: string,
      customer_id: string,
      customer_entitlement_deductions: [{ customer_entitlement_id, credit_cost, feature_id, entity_feature_id, usage_allowed, min_balance, max_balance }],
      balance_key_index_by_feature_id: { [feature_id]: number },
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
      feature_id: string,
      idempotency_ttl_ms: number | null,
      unwind_items: mutation log items | null -- inline unwind source (cascade
                    compensation); takes precedence over the lock receipt
    }

  Usage windows (customer-scoped windowed caps):
    CONFIG IN:    params.usage_window_limits[] -- the resolved caps (limit,
                  bounds, dimension) from fullSubjectToUsageWindowLimits.
    COUNTERS OUT: usage_windows_by_feature_id -- the post-deduction COUNTER
                  ROWS (DbUsageWindow: usage amounts, mirrors the
                  usage_windows table), NOT the config.
    Counters live in the capped feature's balance hash under the reserved
    '_usage_windows' field (so each capped feature's hash key must be in
    KEYS[], via usageWindowFeatureIds in the TS key builder); they are loaded
    into context.usage_windows by init_context and follow the same in-memory
    mutate -> flush lifecycle as entitlement balances. Enforcement is woven
    into the deduction passes like spend limits: each ent's deductible amount
    is gated by window headroom (with credit conversions), and a window-capped
    leftover flows through the standard overage_behaviour handling ('cap'
    applies the partial deduction, 'reject' returns INSUFFICIENT_BALANCE). A
    missing field loads as an empty counter set (fail open).

  Returns JSON:
    {
      updates: { [cus_ent_id]: { balance, additional_balance, adjustment, entities, deducted, additional_deducted } },
      rollover_updates: { [rollover_id]: { balance, usage, entities } },
      modified_customer_entitlement_ids: string[],
      usage_windows_by_feature_id: { [feature_id]: DbUsageWindow[] } | null,
      usage_window_mutations: { usage_window_id, feature_id, internal_entity_id, window_start_at, usage_delta }[],
      remaining: number,
      error: string | null,
      feature_id: string | null
    }
]]

-- ============================================================================
-- MAIN SCRIPT
-- ============================================================================
local routing_key = KEYS[1]
local params = cjson.decode(ARGV[1])

-- Resolve keys from KEYS[] (never from ARGV) so every key the script touches
-- is declared for key-based locking.
local lock_receipt_key_from_keys = KEYS[2]
if lock_receipt_key_from_keys == '' then
  lock_receipt_key_from_keys = nil
end
local idempotency_key = KEYS[3]
if idempotency_key == '' then
  idempotency_key = nil
end

-- Rebuild balance_keys_by_feature_id by dereferencing KEYS via the index map.
-- Downstream helpers (readSubjectBalances, contextUtilsV2, updateAggregatedBalances)
-- read this table off params/context.
local balance_keys_by_feature_id = {}
local balance_key_index_by_feature_id =
  params.balance_key_index_by_feature_id or {}
for feature_id_value, key_index in pairs(balance_key_index_by_feature_id) do
  local resolved_key = KEYS[key_index]
  if resolved_key and resolved_key ~= '' then
    balance_keys_by_feature_id[feature_id_value] = resolved_key
  end
end
params.balance_keys_by_feature_id = balance_keys_by_feature_id

local org_id = params.org_id
local env = params.env
local customer_id = params.customer_id

-- Extract parameters
local customer_entitlement_deductions =
  params.customer_entitlement_deductions or {}
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
local idempotency_ttl_ms = params.idempotency_ttl_ms
local lock = params.lock
local unwind_value = params.unwind_value
local lock_receipt_key = lock_receipt_key_from_keys
local usage_window_limits = params.usage_window_limits
local usage_window_now = params.usage_window_now
local usage_window_ttl_seconds = params.usage_window_ttl_seconds
local is_consumption = params.is_consumption

if not is_nil(idempotency_key) then
  if redis.call('EXISTS', idempotency_key) == 1 then
    return cjson.encode({
      error = 'DUPLICATE_IDEMPOTENCY_KEY',
      updates = {},
      rollover_updates = {},
      modified_customer_entitlement_ids = new_empty_array(),
      mutation_logs = new_empty_array(),
      remaining = 0,
      logs = new_empty_array(),
    })
  end
end

-- Initialize context with in-memory state from Redis
if #customer_entitlement_deductions == 0 then
  return cjson.encode({
    updates = {},
    rollover_updates = {},
    modified_customer_entitlement_ids = new_empty_array(),
    mutation_logs = new_empty_array(),
    remaining = 0,
    error = cjson.null,
    logs = new_empty_array(),
  })
end

-- Usage windows are enforced for positive consumption INCLUDING locks (a
-- lock reserves headroom and counts at lock time), never for refunds,
-- target_balance, or granted-balance edits. Unwinds don't enforce but DO
-- load counters so the freed amount can be decremented back. Computed before
-- init_context so non-participating calls skip the counter reads entirely.
local has_usage_window_limits = not is_nil(usage_window_limits)
    and #usage_window_limits > 0
-- A zero unwind_value (finalize at-or-above the lock) is no unwind at all:
-- the extra delta must still be enforced and counted.
local has_unwind = not is_nil(unwind_value) and safe_number(unwind_value) > 0
local enforce_usage_windows = is_consumption
    and not has_unwind
    and has_usage_window_limits
local unwind_usage_windows = has_unwind and has_usage_window_limits

local context = init_context({
  org_id = org_id,
  env = env,
  customer_id = customer_id,
  customer_entitlement_deductions = customer_entitlement_deductions,
  usage_window_limits = (enforce_usage_windows or unwind_usage_windows)
      and usage_window_limits
    or nil,
  usage_window_now = usage_window_now,
  balance_keys_by_feature_id = params.balance_keys_by_feature_id,
  debug = params.debug,
})

if #(context.missing_customer_entitlement_ids or {}) > 0 then
  return cjson.encode({
    error = 'SUBJECT_BALANCE_NOT_FOUND',
    updates = {},
    rollover_updates = {},
    modified_customer_entitlement_ids = new_empty_array(),
    mutation_logs = new_empty_array(),
    remaining = 0,
    logs = context.logs,
    missing_customer_entitlement_ids = context.missing_customer_entitlement_ids,
  })
end

local unwind_modified_cus_ent_ids = {}

if not is_nil(unwind_value) and safe_number(unwind_value) > 0 then
  local unwind_result = unwind_lock_on_context({
    context = context,
    lock_receipt_key = lock_receipt_key,
    unwind_value = unwind_value,
    items = params.unwind_items,
  })

  if not is_nil(unwind_result.error) then
    return cjson.encode({
      error = unwind_result.error,
      updates = {},
      rollover_updates = {},
      modified_customer_entitlement_ids = new_empty_array(),
      mutation_logs = context.mutation_logs or cjson.decode('[]'),
      remaining = 0,
      logs = context.logs,
    })
  end

  -- Track which entitlements the unwind touched so the caller can sync them.
  unwind_modified_cus_ent_ids = unwind_result.modified_customer_entitlement_ids or {}

  if unwind_usage_windows then
    decrement_usage_windows_for_unwind({
      context = context,
      iterations = unwind_result.iterations,
      skipped_iterations = unwind_result.skipped_iterations,
      fallback_feature_id = feature_id,
      now = usage_window_now,
    })
  end

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
  customer_entitlement_deductions = customer_entitlement_deductions,
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
local usage_window_mutations = context.usage_window_mutations
if type(usage_window_mutations) ~= 'table' or #usage_window_mutations == 0 then
  usage_window_mutations = cjson.decode('[]')
end
-- Throw error and don't apply updates if we're in reject mode and there's
-- still remaining amount. Usage-window shortfalls flow through here like any
-- other: the deduction passes already gated every ent by window headroom, so
-- a window-capped leftover clamps under 'cap' and rejects as
-- INSUFFICIENT_BALANCE under 'reject'.
if remaining_amount > 0 and overage_behaviour == 'reject' then
  return cjson.encode({
    error = 'INSUFFICIENT_BALANCE',
    feature_id = feature_id,
    remaining = remaining_amount,
    updates = {},
    modified_customer_entitlement_ids = new_empty_array(),
    mutation_logs = mutation_logs,
    logs = context.logs
  })
end

if enforce_usage_windows then
  increment_usage_window_counters({
    context = context,
    usage_window_limits = usage_window_limits,
    now = usage_window_now,
  })
end

local modified_customer_entitlement_ids = collect_modified_customer_entitlement_ids({
  context = context,
  extra_customer_entitlement_ids = unwind_modified_cus_ent_ids,
})

if not is_nil(lock)
    and not is_nil(lock.enabled)
    and lock.enabled
    and not is_nil(lock_receipt_key_from_keys)
then
  -- Check if lock receipt already exists; if so, reject without applying writes
  local existing_receipt = nil
  if redis.call('EXISTS', lock_receipt_key_from_keys) == 1 then
    existing_receipt = load_lock_receipt(lock_receipt_key_from_keys)
  end
  if not is_nil(existing_receipt) then
    return cjson.encode({
      error = 'LOCK_ALREADY_EXISTS',
      feature_id = feature_id,
      remaining = 0,
      updates = {},
      rollover_updates = rollover_updates,
      modified_customer_entitlement_ids = modified_customer_entitlement_ids,
      mutation_logs = mutation_logs,
      logs = context.logs
    })
  end

  save_lock_receipt_from_updates({
    lock_receipt_key = lock_receipt_key_from_keys,
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
apply_pending_writes(routing_key, context)

update_aggregated_balances({
  context = context,
  mutation_logs = mutation_logs,
})

if enforce_usage_windows or unwind_usage_windows then
  apply_usage_window_writes(context, usage_window_ttl_seconds)
end

if not is_nil(idempotency_key) and not is_nil(idempotency_ttl_ms) then
  redis.call('SET', idempotency_key, '1', 'PX', idempotency_ttl_ms)
end

logger.log("=== LUA DEDUCTION END ===")

return cjson.encode({
  updates = updates,
  rollover_updates = rollover_updates,
  modified_customer_entitlement_ids = modified_customer_entitlement_ids,
  mutation_logs = mutation_logs,
  usage_windows_by_feature_id =
    usage_windows_to_result(context) or cjson.null,
  usage_window_mutations = usage_window_mutations,
  remaining = remaining_amount,
  error = cjson.null,
  logs = context.logs
})
