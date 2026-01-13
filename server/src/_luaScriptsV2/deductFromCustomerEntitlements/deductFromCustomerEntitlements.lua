--[[
  Lua Script: Deduct from Customer Entitlements in Redis
  
  Uses JSON.NUMINCRBY for atomic incremental updates.
  Reads CURRENT balance from Redis before each calculation to avoid stale reads.
  
  Deduction Order (mirrors SQL performDeduction.sql):
    1. Deduct from rollovers first (oldest first by expires_at)
    2. Pass 1: Deduct from main balance (floor at 0)
    3. Pass 2: Allow negative if usage_allowed
  
  Helper functions are prepended via string interpolation from:
    - luaUtils.lua (safe_table, safe_number, find_entitlement, build_entity_path, sorted_keys, is_nil)
    - readBalances.lua (read_current_balance, read_current_entity_balance, read_current_entities, read_rollover_data)
    - contextUtils.lua (init_context, update_in_memory_customer_entitlement, queue_balance_update, apply_pending_writes)
    - deductFromRollovers.lua (deduct_from_rollovers)
    - deductFromMainBalance.lua (calculate_change, deduct_from_main_balance)
    - getTotalBalance.lua (get_total_balance)
  
  KEYS[1] = FullCustomer cache key
  
  ARGV[1] = JSON params:
    {
      sorted_entitlements: [{ customer_entitlement_id, credit_cost, entity_feature_id, usage_allowed, min_balance, max_balance }],
      amount_to_deduct: number | null,
      target_balance: number | null,
      target_entity_id: string | nil,
      rollover_ids: string[] | nil,
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

-- Extract parameters
local sorted_entitlements = params.sorted_entitlements or {}
local amount_to_deduct = params.amount_to_deduct
local target_balance = params.target_balance
local target_entity_id = params.target_entity_id
local rollover_ids = params.rollover_ids
local skip_additional_balance = params.skip_additional_balance or false
local alter_granted_balance = params.alter_granted_balance or false
local overage_behaviour = params.overage_behaviour or 'cap'
local feature_id = params.feature_id

-- Compute overage_behavior_is_allow once
local overage_behavior_is_allow = alter_granted_balance or overage_behaviour == 'allow'

-- Check if customer exists (just check the key exists)
local key_exists = redis.call('EXISTS', cache_key)
if key_exists == 0 then
  return cjson.encode({ error = 'CUSTOMER_NOT_FOUND', updates = {}, remaining = 0 })
end

-- Get FullCustomer structure (for finding entitlement indices only)
local full_customer_json = redis.call('JSON.GET', cache_key, '.')
if not full_customer_json then
  return cjson.encode({ error = 'CUSTOMER_NOT_FOUND', updates = {}, remaining = 0 })
end

local full_customer = cjson.decode(full_customer_json)

if not full_customer.customer_products then
  return cjson.encode({ 
    error = 'NO_CUSTOMER_PRODUCTS', 
    updates = {}, 
    remaining = 0
  })
end

-- Track updates for return value
local updates = {}

-- Initialize context with in-memory state from Redis
local context = init_context({
  cache_key = cache_key,
  sorted_entitlements = sorted_entitlements,
  full_customer = full_customer,
})

-- Initialize remaining_amount (after context so we can use get_total_balance)
local remaining_amount
if not is_nil(target_balance) then
  -- Calculate amount to deduct based on target_balance
  local current_total = get_total_balance({
    context = context,
    sorted_entitlements = sorted_entitlements,
    target_entity_id = target_entity_id,
  })
  remaining_amount = current_total - target_balance
else
  remaining_amount = amount_to_deduct or 0
end

-- ============================================================================
-- HELPER: Round number to eliminate floating point errors
-- ============================================================================
local function round_to_precision(num, decimals)
  local mult = 10 ^ (decimals or 10)
  return math.floor(num * mult + 0.5) / mult
end

-- Determine if this is a refund (negative amount)
local is_refund = remaining_amount < 0

local logger = context.logger
logger.log("=== LUA DEDUCTION START ===")
logger.log("=== PARAMS ===")
logger.log("  amount_to_deduct: %s", tostring(amount_to_deduct or "nil"))
logger.log("  target_balance: %s", tostring(target_balance or "nil"))
logger.log("  remaining_amount: %s", tostring(remaining_amount or "nil"))
logger.log("  is_refund: %s", tostring(is_refund or false))
logger.log("  alter_granted_balance: %s", tostring(alter_granted_balance or false))
logger.log("  target_entity_id: %s", tostring(target_entity_id or "nil"))
logger.log("  overage_behaviour: %s", tostring(overage_behaviour or "nil"))


-- ============================================================================
-- HELPER: Process a single pass over customer_entitlements
-- ============================================================================
local function process_pass(pass_config)
  local pass_number = pass_config.pass_number
  local pass_name = "PASS" .. pass_number
  local skip_if_not_usage_allowed = pass_config.skip_if_not_usage_allowed
  local context = pass_config.context
  local logger = context.logger
  
  logger.log("=== %s START ===", pass_name)
  
  for ent_idx, ent_obj in ipairs(sorted_entitlements) do
    if remaining_amount == 0 then break end
    
    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost
    -- Handle cjson.null (truthy in Lua) and zero/nil values
    if credit_cost == cjson.null or credit_cost == nil or credit_cost == 0 then
      credit_cost = 1
    end
    local min_balance = ent_obj.min_balance
    local max_balance = ent_obj.max_balance
    
    -- Check usage_allowed
    local usage_allowed = ent_obj.usage_allowed
    if usage_allowed == cjson.null then usage_allowed = false end
    usage_allowed = usage_allowed or overage_behavior_is_allow
    
    -- Apply filter: only process if usage is allowed (or skip filter is disabled)
    local should_process = not skip_if_not_usage_allowed or usage_allowed
    
    -- Skip if not in context (entitlement wasn't found during init_context)
    if not context.customer_entitlements[ent_id] then
      should_process = false
    end
    
    if not should_process then
      logger.log("%s skipping %s - usage_allowed=false or not in context", pass_name, ent_id)
    else
      local deducted = deduct_from_main_balance({
        context = context,
        ent_id = ent_id,
        target_entity_id = target_entity_id,
        amount = remaining_amount,
        credit_cost = credit_cost,
        pass_number = pass_number,
        min_balance = min_balance,
        max_balance = max_balance,
        alter_granted_balance = alter_granted_balance,
        overage_behavior_is_allow = overage_behavior_is_allow,
        log_prefix = pass_name,
      })
      
      -- Update remaining_amount
      remaining_amount = remaining_amount - (deducted / credit_cost)
      
      -- Track in updates
      if deducted ~= 0 then
        if not updates[ent_id] then
          updates[ent_id] = { deducted = 0, additional_deducted = 0 }
        end
        updates[ent_id].deducted = (updates[ent_id].deducted or 0) + deducted
      end
      
      logger.log("%s ent %s deducted=%s remaining=%s", pass_name, ent_id, deducted, remaining_amount)
    end
  end
  
  logger.log("=== %s END === remaining=%s", pass_name, remaining_amount)
end

-- ============================================================================
-- HELPER: Process rollovers before main balance deduction
-- ============================================================================
local function process_rollovers(config)
  local context = config.context
  local rollover_ids = config.rollover_ids
  local remaining = config.remaining_amount
  local target_entity_id = config.target_entity_id
  local sorted_entitlements = config.sorted_entitlements
  local logger = context.logger
  
  -- Early return if no rollovers or no positive amount
  if is_nil(rollover_ids) or #rollover_ids == 0 or remaining <= 0 then
    return 0
  end
  
  -- Determine has_entity_scope from first entitlement
  local first_ent = sorted_entitlements[1]
  local has_entity_scope = false
  if first_ent then
    has_entity_scope = first_ent.entity_feature_id ~= nil and first_ent.entity_feature_id ~= cjson.null
  end
  
  local rollover_deducted = deduct_from_rollovers({
    context = context,
    rollover_ids = rollover_ids,
    amount = remaining,
    target_entity_id = target_entity_id,
    has_entity_scope = has_entity_scope,
  })
  
  logger.log("Rollover deduction: deducted=%s, remaining=%s", rollover_deducted, remaining - rollover_deducted)
  
  return rollover_deducted
end

-- ============================================================================
-- MAIN DEDUCTION/REFUND LOGIC
-- Same two-pass structure for both deductions and refunds (matches SQL)
-- Step 1: Deduct from rollovers first (only for positive deductions)
-- Pass 1: Process all entitlements (floor at 0 for deductions, ceiling at 0 for refunds)
-- Pass 2: Process remaining (deductions: only usage_allowed can go negative; refunds: all can go above 0)
-- ============================================================================

-- Step 1: Deduct from rollovers BEFORE main balance deduction (only for track, not update balance)
if not alter_granted_balance then
  local rollover_deducted = process_rollovers({
    context = context,
    rollover_ids = rollover_ids,
    remaining_amount = remaining_amount,
    target_entity_id = target_entity_id,
    sorted_entitlements = sorted_entitlements,
  })
  remaining_amount = remaining_amount - rollover_deducted
end

process_pass({
  pass_number = 1,
  skip_if_not_usage_allowed = false,
  context = context,
})


-- Pass 2: Exceed bounds
-- For deductions: only usage_allowed entitlements can go below 0 (into overage)
-- For refunds: ALL entitlements can go above 0 (up to max_balance)
if remaining_amount ~= 0 then
  process_pass({
    pass_number = 2,
    skip_if_not_usage_allowed = not is_refund,  -- Only skip for deductions, not refunds
    context = context,
  })
  
end

remaining_amount = round_to_precision(remaining_amount, 10)
-- Throw error and don't apply updates if we're in reject mode and there's still remaining amount
if remaining_amount > 0 and overage_behaviour == 'reject' then
  return cjson.encode({
    error = 'INSUFFICIENT_BALANCE',
    feature_id = feature_id,
    remaining = remaining_amount,
    updates = {},
    logs = context.logs
  })
end 

-- Apply all pending writes to Redis (only after validation passes)
apply_pending_writes(cache_key, context)

-- ============================================================================
-- BUILD FINAL RETURN VALUE FROM CONTEXT
-- ============================================================================
for ent_id, update in pairs(updates) do
  local ent_data = context.customer_entitlements[ent_id]
  if ent_data then
    if ent_data.has_entity_scope then
      update.entities = ent_data.entities
      update.balance = 0 -- Top-level unchanged for entity-scoped
    else
      update.balance = ent_data.balance
    end
    update.adjustment = ent_data.adjustment or 0
    update.additional_balance = 0
  end
end

-- Build rollover_updates from context.rollovers (only include modified ones)
local rollover_updates = {}
if not is_nil(rollover_ids) then
  for rollover_id, rollover_data in pairs(context.rollovers) do
    -- Include all rollovers that were in the rollover_ids list (they may have been modified)
    for _, rid in ipairs(rollover_ids) do
      if rid == rollover_id then
        rollover_updates[rollover_id] = {
          balance = rollover_data.balance,
          usage = rollover_data.usage,
          entities = rollover_data.entities,
        }
        break
      end
    end
  end
end

logger.log("=== LUA DEDUCTION END ===")

return cjson.encode({
  updates = updates,
  rollover_updates = rollover_updates,
  remaining = remaining_amount,
  error = cjson.null,
  logs = context.logs
})
