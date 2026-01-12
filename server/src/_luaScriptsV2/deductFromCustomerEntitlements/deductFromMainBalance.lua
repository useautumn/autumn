-- ============================================================================
-- DEDUCT FROM MAIN BALANCE
-- Unified function for all balance modifications (deductions and refunds)
-- Mirrors SQL deductFromMainBalance.sql structure
-- ============================================================================

--[[
  calculate_change(balance, amount, params)
  
  Calculates how much to deduct or add based on floor/ceiling constraints.
  
  For deductions (amount > 0):
    - Pass 1: floor at 0
    - Pass 2: floor at min_balance (can go below 0)
    
  For refunds (amount < 0):
    - Pass 1: ceiling at 0 (only refund from negative up to 0)
    - Pass 2: ceiling at max_balance (can go above 0)
    
  Returns: number (positive = deducted, negative = added)
]]
local function calculate_change(balance, amount, params)
  local pass_number = params.pass_number or 1
  local overage_behavior_is_allow = params.overage_behavior_is_allow
  
  if amount < 0 then
    -- REFUND: amount is negative, we want to ADD to balance
    local to_add = -amount  -- Make positive for easier math
    
    if pass_number == 1 then
      -- Pass 1: Ceiling at 0 (only refund from negative up to 0)
      local ceiling = 0
      local max_addable = math.max(0, ceiling - balance)
      return -math.min(to_add, max_addable)
    else
      -- Pass 2: Ceiling at max_balance (can go above 0)
      if overage_behavior_is_allow then
        return amount  -- No ceiling constraint
      elseif params.max_balance then
        local adjustment = params.adjustment or 0
        local ceiling = params.max_balance + adjustment
        local max_addable = math.max(0, ceiling - balance)
        return -math.min(to_add, max_addable)
      else
        return amount  -- No max_balance: add full amount
      end
    end
    
  else
    -- DEDUCTION: amount is positive, we want to SUBTRACT from balance
    if pass_number == 2 then
      -- Pass 2: Floor at min_balance (can go below 0)
      if overage_behavior_is_allow then
        return amount  -- No floor constraint
      elseif params.min_balance then
        local to_deduct = math.min(amount, balance - params.min_balance)
        return math.max(0, to_deduct)
      else
        return amount  -- no floor, deduct full amount
      end
    else
      -- Pass 1: Floor at 0
      return math.max(0, math.min(amount, balance))
    end
  end
end

--[[
  deduct_from_main_balance(params)
  
  Unified function for all balance modifications.
  Handles all 3 entity scenarios:
    1. Entity-scoped with target entity (single)
    2. Entity-scoped without target (all entities)
    3. Top-level balance (no entity scope)
  
  Uses context object for in-memory operations:
    - Reads balances from context.customer_entitlements
    - Queues writes via queue_balance_update (applied later)
    - Updates context balances in-memory after calculating change
    - Logs to context.logs
  
  params:
    context: table (context object from init_context)
    ent_id: string (customer_entitlement id)
    target_entity_id: string | nil
    amount: number (positive=deduct, negative=refund)
    credit_cost: number
    pass_number: number (1 or 2)
    min_balance: number | nil (floor for deductions)
    max_balance: number | nil (ceiling for refunds)
    alter_granted_balance: boolean
    overage_behavior_is_allow: boolean
    log_prefix: string (for debug logging)
    
  Returns:
    deducted: number (positive=deducted, negative=added)
]]
local function deduct_from_main_balance(params)
  local context = params.context
  local ent_id = params.ent_id
  local ent_data = context.customer_entitlements[ent_id]
  local logger = context.logger

  
  if not ent_data then
    return 0
  end
  
  local amount = params.amount * params.credit_cost
  local deducted = 0
  local prefix = params.log_prefix or ""
  local base_path = ent_data.base_path
  
  -- Base calc_params (adjustment is set per-case since entities have their own)
  local base_calc_params = {
    max_balance = params.max_balance,
    min_balance = params.min_balance,
    pass_number = params.pass_number,
    overage_behavior_is_allow = params.overage_behavior_is_allow,
  }
  
  if ent_data.has_entity_scope and not is_nil(params.target_entity_id) then
    -- ========================================================================
    -- CASE 1: Entity-scoped with specific target entity
    -- ========================================================================
    local entities = ent_data.entities or {}
    local entity_obj = entities[params.target_entity_id]
    local balance = entity_obj and safe_number(entity_obj.balance) or 0
    local entity_adjustment = entity_obj and safe_number(entity_obj.adjustment) or 0
    
    -- Use entity-specific adjustment
    local calc_params = {
      max_balance = base_calc_params.max_balance,
      min_balance = base_calc_params.min_balance,
      pass_number = base_calc_params.pass_number,
      overage_behavior_is_allow = base_calc_params.overage_behavior_is_allow,
      adjustment = entity_adjustment,
    }
    
    local to_change = calculate_change(balance, amount, calc_params)
    
    logger.log("%s type: entity, entity_id: %s, balance: %s, to_change: %s", prefix, params.target_entity_id, balance, to_change)
    
    if to_change ~= 0 then
      local entity_path = build_entity_path(base_path, params.target_entity_id)
      
      queue_balance_update({
        context = context,
        path = entity_path,
        delta = -to_change,
        alter_granted_balance = params.alter_granted_balance,
      })
      
      update_in_memory_customer_entitlement({
        target = entities,
        entity_id = params.target_entity_id,
        delta = -to_change,
        alter_granted_balance = params.alter_granted_balance,
      })
      
      deducted = to_change
    end
    
  elseif ent_data.has_entity_scope then
    -- ========================================================================
    -- CASE 2: Entity-scoped without target (all entities)
    -- ========================================================================
    local entities = ent_data.entities or {}
    local keys = sorted_keys(entities)
    
    local remaining = amount
    for _, entity_key in ipairs(keys) do
      if remaining == 0 then break end
      
      local entity_obj = entities[entity_key]
      local balance = entity_obj and safe_number(entity_obj.balance) or 0
      local entity_adjustment = entity_obj and safe_number(entity_obj.adjustment) or 0
      
      -- Use entity-specific adjustment
      local calc_params = {
        max_balance = base_calc_params.max_balance,
        min_balance = base_calc_params.min_balance,
        pass_number = base_calc_params.pass_number,
        overage_behavior_is_allow = base_calc_params.overage_behavior_is_allow,
        adjustment = entity_adjustment,
      }
      
      local to_change = calculate_change(balance, remaining, calc_params)
      
      if to_change ~= 0 then
        local entity_path = build_entity_path(base_path, entity_key)
        
        queue_balance_update({
          context = context,
          path = entity_path,
          delta = -to_change,
          alter_granted_balance = params.alter_granted_balance,
        })
        
        update_in_memory_customer_entitlement({
          target = entities,
          entity_id = entity_key,
          delta = -to_change,
          alter_granted_balance = params.alter_granted_balance,
        })
        
        deducted = deducted + to_change
        remaining = remaining - to_change
      end
    end
    
  else
    -- ========================================================================
    -- CASE 3: Top-level balance (no entity scope)
    -- ========================================================================
    local balance = ent_data.balance
    
    -- table.insert(context.logs, prefix .. " top-level balance=" .. tostring(balance))
    
    
    -- Use customer_entitlement-level adjustment for top-level balance
    local calc_params = {
      max_balance = base_calc_params.max_balance,
      min_balance = base_calc_params.min_balance,
      pass_number = base_calc_params.pass_number,
      overage_behavior_is_allow = base_calc_params.overage_behavior_is_allow,
      adjustment = ent_data.adjustment,
    }
    
    local to_change = calculate_change(balance, amount, calc_params)
    
    logger.log("%s type: top_level, balance: %s, adjustment: %s, to_change: %s", prefix, balance, ent_data.adjustment, to_change)
    
    if to_change ~= 0 then
      local delta = -to_change
      logger.log("%s queuing: delta=%s, alter_granted_balance=%s", prefix, delta, tostring(params.alter_granted_balance))
      
      queue_balance_update({
        context = context,
        path = base_path,
        delta = delta,
        alter_granted_balance = params.alter_granted_balance,
      })
      
      update_in_memory_customer_entitlement({
        target = ent_data,
        entity_id = nil,
        delta = delta,
        alter_granted_balance = params.alter_granted_balance,
      })
      
      logger.log("%s after update: balance=%s, adjustment=%s", prefix, ent_data.balance, ent_data.adjustment)
      
      deducted = to_change
    end
  end
  
  return deducted
end
