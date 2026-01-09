--[[
  Lua Script: Deduct from Customer Entitlements in Redis
  
  Uses JSON.NUMINCRBY for atomic incremental updates.
  Reads CURRENT balance from Redis before each calculation to avoid stale reads.
  
  Helper functions are prepended via string interpolation from:
    - luaUtils.lua (safe_table, safe_number, find_entitlement, build_entity_path, sorted_keys)
    - readBalances.lua (read_current_balance, read_current_entity_balance, read_current_entities)
    - deductFromRollovers.lua (deduct_from_rollovers - stub)
    - deductFromMainBalance.lua (calculate_change, deduct_from_main_balance)
  
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

-- Initialize remaining_amount
local remaining_amount = amount_to_deduct or 0

-- Track updates for return value
local updates = {}
local logs = {} -- Debug logs

-- Determine if this is a refund (negative amount)
local is_refund = remaining_amount < 0

table.insert(logs, "=== LUA DEDUCTION START (FRESH READS) ===")
table.insert(logs, "amount_to_deduct: " .. tostring(amount_to_deduct))
table.insert(logs, "is_refund: " .. tostring(is_refund))
table.insert(logs, "target_entity_id: " .. tostring(target_entity_id))
table.insert(logs, "overage_behaviour: " .. tostring(overage_behaviour))

-- ============================================================================
-- PRE-CHECK FOR REJECT MODE: Calculate total available balance before any writes
-- This ensures we don't make partial deductions that we'd need to roll back
-- ============================================================================
if overage_behaviour == 'reject' and remaining_amount > 0 then
  local total_available = 0
  
  table.insert(logs, "=== PRE-CHECK START ===")
  
  for ent_idx, ent_obj in ipairs(sorted_entitlements) do
    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost or 1
    local min_balance = ent_obj.min_balance
    local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
    local usage_allowed = ent_obj.usage_allowed
    if usage_allowed == cjson.null then usage_allowed = false end
    usage_allowed = usage_allowed or overage_behavior_is_allow
    
    table.insert(logs, "PRE-CHECK ent=" .. tostring(ent_id) .. " has_entity_scope=" .. tostring(has_entity_scope) .. " target_entity_id=" .. tostring(target_entity_id))
    
    local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
    
    table.insert(logs, "PRE-CHECK found cus_ent=" .. tostring(cus_ent ~= nil) .. " cp_idx=" .. tostring(cp_idx) .. " ce_idx=" .. tostring(ce_idx))
    
    if cus_ent then
      local cp_idx_0 = cp_idx - 1
      local ce_idx_0 = ce_idx - 1
      local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
      
      table.insert(logs, "PRE-CHECK base_path=" .. base_path)
      
      if has_entity_scope and target_entity_id then
        local entity_data = read_current_entity_balance(cache_key, base_path, target_entity_id)
        local entity_balance = entity_data and entity_data.balance or 0
        
        -- Pass 1 availability: down to 0
        local pass1_available = math.max(0, entity_balance)
        total_available = total_available + (pass1_available / credit_cost)
        
        -- Pass 2 availability: if usage_allowed, can go to min_balance
        if usage_allowed then
          local floor = min_balance or 0
          local pass2_available = math.max(0, 0 - floor)
          total_available = total_available + (pass2_available / credit_cost)
        end
        
      elseif has_entity_scope and not target_entity_id then
        local current_entities = read_current_entities(cache_key, base_path)
        for entity_key, entity_data in pairs(current_entities) do
          local entity_balance = safe_number(entity_data.balance)
          local pass1_available = math.max(0, entity_balance)
          total_available = total_available + (pass1_available / credit_cost)
          
          if usage_allowed then
            local floor = min_balance or 0
            local pass2_available = math.max(0, 0 - floor)
            total_available = total_available + (pass2_available / credit_cost)
          end
        end
        
      else
        local current_balance = read_current_balance(cache_key, base_path)
        local pass1_available = math.max(0, current_balance)
        total_available = total_available + (pass1_available / credit_cost)
        
        if usage_allowed then
          local floor = min_balance or 0
          local pass2_available = math.max(0, 0 - floor)
          total_available = total_available + (pass2_available / credit_cost)
        end
      end
    end
  end
  
  table.insert(logs, "PRE-CHECK total_available=" .. tostring(total_available) .. " required=" .. tostring(remaining_amount))
  
  if total_available < remaining_amount then
    table.insert(logs, "PRE-CHECK FAILED - insufficient balance")
    return cjson.encode({
      error = 'INSUFFICIENT_BALANCE',
      feature_id = feature_id,
      remaining = remaining_amount - total_available,
      updates = {},
      logs = logs
    })
  end
  
  table.insert(logs, "PRE-CHECK PASSED")
end

-- ============================================================================
-- HELPER: Process a single pass over entitlements
-- ============================================================================
local function process_pass(pass_config)
  local pass_name = pass_config.name
  local allow_negative = pass_config.allow_negative
  local skip_if_not_usage_allowed = pass_config.skip_if_not_usage_allowed
  
  table.insert(logs, "=== " .. pass_name .. " START ===")
  
  for ent_idx, ent_obj in ipairs(sorted_entitlements) do
    -- Check termination condition based on direction
    if is_refund then
      if remaining_amount >= 0 then break end
    else
      if remaining_amount == 0 then break end
    end
    
    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost or 1
    local min_balance = ent_obj.min_balance
    local max_balance = ent_obj.max_balance
    local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
    
    -- Check usage_allowed
    local usage_allowed = ent_obj.usage_allowed
    if usage_allowed == cjson.null then usage_allowed = false end
    usage_allowed = usage_allowed or overage_behavior_is_allow
    
    -- Apply filter if needed
    if skip_if_not_usage_allowed and not usage_allowed then
      table.insert(logs, pass_name .. " skipping " .. ent_id .. " - usage_allowed=false")
      goto continue
    end
    
    local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
    
    if cus_ent then
      local cp_idx_0 = cp_idx - 1
      local ce_idx_0 = ce_idx - 1
      local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
      
      -- Get current adjustment from cus_ent for ceiling calculation
      local current_adjustment = cus_ent.adjustment or 0
      
      local deducted = deduct_from_main_balance({
        cache_key = cache_key,
        base_path = base_path,
        has_entity_scope = has_entity_scope,
        target_entity_id = target_entity_id,
        amount = remaining_amount,
        credit_cost = credit_cost,
        allow_negative = allow_negative,
        min_balance = min_balance,
        max_balance = max_balance,
        adjustment = current_adjustment,
        alter_granted_balance = alter_granted_balance,
        overage_behavior_is_allow = overage_behavior_is_allow,
        logs = logs,
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
      
      table.insert(logs, pass_name .. " ent " .. ent_id .. " deducted=" .. tostring(deducted) .. " remaining=" .. tostring(remaining_amount))
    end
    
    ::continue::
  end
  
  table.insert(logs, "=== " .. pass_name .. " END === remaining=" .. tostring(remaining_amount))
end

-- ============================================================================
-- MAIN DEDUCTION/REFUND LOGIC
-- Same two-pass structure for both deductions and refunds (matches SQL)
-- Pass 1: Process all entitlements (floor at 0 for deductions, ceiling for refunds)
-- Pass 2: Only for positive amounts - allow usage_allowed entitlements to go negative
-- ============================================================================

process_pass({
  name = "PASS1",
  allow_negative = false,
  skip_if_not_usage_allowed = false,
})

-- Pass 2 only applies to positive deductions (not refunds)
if remaining_amount > 0 then
  process_pass({
    name = "PASS2",
    allow_negative = true,
    skip_if_not_usage_allowed = true,
  })
end

-- Safety check: if we still have remaining after both passes with reject mode
if remaining_amount > 0 and overage_behaviour == 'reject' then
  return cjson.encode({
    error = 'INSUFFICIENT_BALANCE',
    feature_id = feature_id,
    remaining = remaining_amount,
    updates = updates
  })
end

-- ============================================================================
-- READ FINAL BALANCES FOR RETURN VALUE
-- ============================================================================
for ent_id, update in pairs(updates) do
  local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
  if cus_ent then
    local cp_idx_0 = cp_idx - 1
    local ce_idx_0 = ce_idx - 1
    local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
    
    local has_entity_scope = false
    for _, ent_obj in ipairs(sorted_entitlements) do
      if ent_obj.customer_entitlement_id == ent_id then
        has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
        break
      end
    end
    
    if has_entity_scope then
      update.entities = read_current_entities(cache_key, base_path)
      update.balance = cus_ent.balance -- Top-level unchanged for entity-scoped
    else
      update.balance = read_current_balance(cache_key, base_path)
    end
    update.adjustment = cus_ent.adjustment or 0
    update.additional_balance = cus_ent.additional_balance or 0
  end
end

table.insert(logs, "=== LUA DEDUCTION END ===")

return cjson.encode({
  updates = updates,
  remaining = remaining_amount,
  error = cjson.null,
  logs = logs
})
