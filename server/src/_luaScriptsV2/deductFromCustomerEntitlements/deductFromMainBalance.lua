-- ============================================================================
-- DEDUCT FROM MAIN BALANCE
-- Unified function for all balance modifications (deductions and refunds)
-- Mirrors SQL deductFromMainBalance.sql structure
-- ============================================================================

--[[
  calculate_change(balance, amount, params)
  
  Calculates how much to deduct or add based on floor/ceiling constraints.
  
  For deductions (amount > 0):
    - Pass 1 (allow_negative=false): floor at 0
    - Pass 2 (allow_negative=true): floor at min_balance
    
  For refunds (amount < 0):
    - Ceiling at max_balance (unless overage_behavior_is_allow)
    
  Returns: number (positive = deduct, negative = add)
]]
local function calculate_change(balance, amount, params)
  if amount < 0 then
    -- REFUND: add to balance, cap at ceiling (max_balance)
    local to_add = -amount
    if params.max_balance and not params.overage_behavior_is_allow then
      local room = params.max_balance - balance
      if room > 0 then
        to_add = math.min(to_add, room)
      else
        to_add = 0
      end
    end
    return -to_add  -- negative = adding to balance
  elseif params.allow_negative then
    -- PASS 2: can go below 0, floor at min_balance
    if params.min_balance then
      local to_deduct = math.min(amount, balance - params.min_balance)
      return math.max(0, to_deduct)
    else
      return amount  -- no floor, deduct full amount
    end
  else
    -- PASS 1: floor at 0
    return math.max(0, math.min(amount, balance))
  end
end

--[[
  deduct_from_main_balance(params)
  
  Unified function for all balance modifications.
  Handles all 3 entity scenarios:
    1. Entity-scoped with target entity (single)
    2. Entity-scoped without target (all entities)
    3. Top-level balance (no entity scope)
  
  params:
    cache_key: string
    base_path: string
    has_entity_scope: boolean
    target_entity_id: string | nil
    amount: number (positive=deduct, negative=refund)
    credit_cost: number
    allow_negative: boolean (Pass 1=false, Pass 2=true)
    min_balance: number | nil (floor for deductions)
    max_balance: number | nil (ceiling for refunds)
    alter_granted_balance: boolean
    overage_behavior_is_allow: boolean
    logs: table (for debug logging)
    log_prefix: string (for debug logging)
    
  Returns:
    deducted: number (positive=deducted, negative=added)
]]
local function deduct_from_main_balance(params)
  local amount = params.amount * params.credit_cost
  local deducted = 0
  local logs = params.logs or {}
  local prefix = params.log_prefix or ""
  
  if params.has_entity_scope and params.target_entity_id then
    -- ========================================================================
    -- CASE 1: Entity-scoped with specific target entity
    -- ========================================================================
    local entity_data = read_current_entity_balance(params.cache_key, params.base_path, params.target_entity_id)
    local balance = entity_data and entity_data.balance or 0
    
    table.insert(logs, prefix .. " entity " .. params.target_entity_id .. " balance=" .. tostring(balance))
    
    local to_change = calculate_change(balance, amount, params)
    
    if to_change ~= 0 then
      local entity_path = build_entity_path(params.base_path, params.target_entity_id)
      redis.call('JSON.NUMINCRBY', params.cache_key, entity_path .. '.balance', -to_change)
      table.insert(logs, "JSON.NUMINCRBY " .. entity_path .. '.balance ' .. tostring(-to_change))
      
      if params.alter_granted_balance then
        redis.call('JSON.NUMINCRBY', params.cache_key, entity_path .. '.adjustment', -to_change)
      end
      
      deducted = to_change
    end
    
  elseif params.has_entity_scope then
    -- ========================================================================
    -- CASE 2: Entity-scoped without target (all entities)
    -- ========================================================================
    local entities = read_current_entities(params.cache_key, params.base_path)
    local keys = sorted_keys(entities)
    
    local remaining = amount
    for _, entity_key in ipairs(keys) do
      if remaining == 0 then break end
      
      local entity_data = read_current_entity_balance(params.cache_key, params.base_path, entity_key)
      local balance = entity_data and entity_data.balance or 0
      
      -- For multi-entity, we need to calculate per-entity with remaining amount
      local entity_params = {
        max_balance = params.max_balance,
        min_balance = params.min_balance,
        allow_negative = params.allow_negative,
        overage_behavior_is_allow = params.overage_behavior_is_allow,
      }
      local to_change = calculate_change(balance, remaining, entity_params)
      
      if to_change ~= 0 then
        local entity_path = build_entity_path(params.base_path, entity_key)
        redis.call('JSON.NUMINCRBY', params.cache_key, entity_path .. '.balance', -to_change)
        
        if params.alter_granted_balance then
          redis.call('JSON.NUMINCRBY', params.cache_key, entity_path .. '.adjustment', -to_change)
        end
        
        deducted = deducted + to_change
        remaining = remaining - to_change
      end
    end
    
  else
    -- ========================================================================
    -- CASE 3: Top-level balance (no entity scope)
    -- ========================================================================
    local balance = read_current_balance(params.cache_key, params.base_path)
    
    table.insert(logs, prefix .. " top-level balance=" .. tostring(balance))
    
    local to_change = calculate_change(balance, amount, params)
    
    table.insert(logs, prefix .. " to_change=" .. tostring(to_change))
    
    if to_change ~= 0 then
      redis.call('JSON.NUMINCRBY', params.cache_key, params.base_path .. '.balance', -to_change)
      table.insert(logs, "JSON.NUMINCRBY " .. params.base_path .. '.balance ' .. tostring(-to_change))
      
      if params.alter_granted_balance then
        redis.call('JSON.NUMINCRBY', params.cache_key, params.base_path .. '.adjustment', -to_change)
      end
      
      deducted = to_change
    end
  end
  
  return deducted
end
