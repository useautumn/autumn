--[[
  Helper: deduct_from_main_balance
  Mirrors SQL function deduct_from_main_balance(jsonb)
  
  Params:
    current_balance: number
    current_entities: table (object)
    current_adjustment: number
    amount_to_deduct: number
    credit_cost: number
    allow_negative: boolean
    has_entity_scope: boolean
    target_entity_id: string | nil
    min_balance: number | nil
    max_balance: number | nil
    alter_granted_balance: boolean
    overage_behavior_is_allow: boolean

  Returns: deducted, new_balance, new_entities, new_adjustment
]]

-- ============================================================================
-- HELPER: Safe table getter (handles cjson.null)
-- cjson.decode() returns cjson.null for JSON null, which is truthy in Lua
-- ============================================================================
local function safe_table(val)
  if val == nil or val == cjson.null or type(val) ~= 'table' then
    return {}
  end
  return val
end

-- ============================================================================
-- HELPER: deduct_from_main_balance
-- ============================================================================
local function deduct_from_main_balance(params)
  local current_balance = params.current_balance or 0
  local current_entities = safe_table(params.current_entities)
  local current_adjustment = params.current_adjustment or 0
  local amount_to_deduct = params.amount_to_deduct or 0
  local credit_cost = params.credit_cost or 1
  local allow_negative = params.allow_negative or false
  local has_entity_scope = params.has_entity_scope or false
  local target_entity_id = params.target_entity_id
  local min_balance = params.min_balance
  local max_balance = params.max_balance
  local alter_granted_balance = params.alter_granted_balance or false
  local overage_behavior_is_allow = params.overage_behavior_is_allow or false
  
  local deducted_amount = 0
  local result_balance = current_balance
  local result_entities = current_entities
  local result_adjustment = current_adjustment
  
  -- ============================================================================
  -- CASE 1: ENTITY-SCOPED - ALL ENTITIES (no specific entity_id)
  -- ============================================================================
  if has_entity_scope and not target_entity_id then
    local remaining = amount_to_deduct * credit_cost
    deducted_amount = 0
    
    -- Sort entity keys for consistency with SQL (ORDER BY 1)
    local entity_keys = {}
    for k in pairs(current_entities) do
      table.insert(entity_keys, k)
    end
    table.sort(entity_keys)
    
    -- Loop through all entities and deduct iteratively
    for _, entity_key in ipairs(entity_keys) do
      if remaining == 0 then break end
      
      local entity_data = result_entities[entity_key] or {}
      local entity_balance = entity_data.balance or 0
      local deduct_amount = 0
      
      -- Calculate deduction respecting allow_negative and min_balance
      if remaining < 0 then
        -- Adding credits: apply ceiling if overage_behavior_is_allow is false and max_balance exists
        if not overage_behavior_is_allow and max_balance then
          local entity_adjustment = entity_data.adjustment or 0
          local ceiling = max_balance + entity_adjustment
          local max_addable = math.max(0, ceiling - entity_balance)
          -- remaining is negative, so -remaining is the amount to add
          deduct_amount = -math.min(-remaining, max_addable)
        else
          -- No ceiling: deduct the entire negative amount (which adds)
          deduct_amount = remaining
        end
      elseif allow_negative then
        if not min_balance then
          deduct_amount = remaining
        else
          deduct_amount = math.min(remaining, entity_balance - min_balance)
        end
      else
        deduct_amount = math.min(entity_balance, remaining)
      end
      
      if deduct_amount ~= 0 then
        local new_balance = entity_balance - deduct_amount
        entity_data.balance = new_balance
        
        -- If alter_granted_balance is true, update adjustment field
        if alter_granted_balance then
          entity_data.adjustment = (entity_data.adjustment or 0) - deduct_amount
        end
        
        result_entities[entity_key] = entity_data
        remaining = remaining - deduct_amount
        deducted_amount = deducted_amount + deduct_amount
      end
    end
    
    -- Top-level balance unchanged for entity-scoped
    result_balance = current_balance
    
  -- ============================================================================
  -- CASE 2: ENTITY-SCOPED - SINGLE ENTITY (specific entity_id provided)
  -- ============================================================================
  elseif has_entity_scope and target_entity_id then
    local entity_data = current_entities[target_entity_id] or {}
    local entity_balance = entity_data.balance or 0
    
    -- Calculate deduction respecting allow_negative and min_balance
    if amount_to_deduct < 0 then
      -- Adding credits: apply ceiling if overage_behavior_is_allow is false and max_balance exists
      if not overage_behavior_is_allow and max_balance then
        local entity_adjustment = entity_data.adjustment or 0
        local ceiling = max_balance + entity_adjustment
        local max_addable = math.max(0, ceiling - entity_balance)
        deducted_amount = -math.min(-amount_to_deduct * credit_cost, max_addable)
      else
        deducted_amount = amount_to_deduct * credit_cost
      end
    elseif allow_negative then
      if not min_balance then
        deducted_amount = amount_to_deduct * credit_cost
      else
        deducted_amount = math.min(amount_to_deduct * credit_cost, entity_balance - min_balance)
      end
    else
      deducted_amount = math.min(entity_balance, amount_to_deduct * credit_cost)
    end
    
    if deducted_amount ~= 0 then
      local new_balance = entity_balance - deducted_amount
      entity_data.balance = new_balance
      
      -- If alter_granted_balance is true, update adjustment field
      if alter_granted_balance then
        entity_data.adjustment = (entity_data.adjustment or 0) - deducted_amount
      end
      
      result_entities[target_entity_id] = entity_data
    end
    
    -- Top-level balance unchanged for entity-scoped
    result_balance = current_balance
    
  -- ============================================================================
  -- CASE 3: TOP-LEVEL BALANCE (no entity scope)
  -- ============================================================================
  else
    -- Calculate deduction based on allow_negative flag
    if amount_to_deduct < 0 then
      -- Adding credits: apply ceiling if overage_behavior_is_allow is false and max_balance exists
      if not overage_behavior_is_allow and max_balance then
        local ceiling = max_balance + current_adjustment
        local max_addable = math.max(0, ceiling - current_balance)
        deducted_amount = -math.min(-amount_to_deduct * credit_cost, max_addable)
      else
        deducted_amount = amount_to_deduct * credit_cost
      end
    elseif allow_negative then
      -- Pass 2: Can go negative (respecting min_balance)
      if not min_balance then
        deducted_amount = amount_to_deduct * credit_cost
      else
        deducted_amount = math.min(amount_to_deduct * credit_cost, current_balance - min_balance)
      end
    else
      -- Pass 1: Only deduct down to zero (can't deduct from negative balance)
      deducted_amount = math.max(0, math.min(current_balance, amount_to_deduct * credit_cost))
    end
    
    result_balance = current_balance - deducted_amount
    -- Entities unchanged for non-entity-scoped
    
    -- If alter_granted_balance is true, update adjustment field
    if alter_granted_balance then
      result_adjustment = result_adjustment - deducted_amount
    end
  end
  
  return deducted_amount, result_balance, result_entities, result_adjustment
end

