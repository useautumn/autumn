-- ============================================================================
-- DEDUCT FROM ROLLOVERS
-- Deducts from rollover balances before main entitlements (mirrors SQL deductFromRollovers.sql)
-- ============================================================================

--[[
  calculate_rollover_change(balance, amount)
  
  Calculates how much to deduct from a rollover balance (simple floor at 0).
  - balance: current rollover balance (in credits)
  - amount: amount to deduct (in credits)
  
  Returns: amount to deduct (in credits, floor at 0)
]]
local function calculate_rollover_change(balance, amount)
  return math.min(balance, amount)
end

--[[
  deduct_from_rollovers(params)
  
  Deducts from rollover balances before main entitlements.
  Mirrors SQL logic in server/src/internal/balances/utils/sql/deductFromRollovers.sql
  
  NOTE: Unlike deduct_from_main_balance which has a single credit_cost for the whole
  operation, rollovers can have different credit_costs (each rollover may come from
  a different entitlement with different credit systems). So we must convert
  per-rollover rather than once upfront.
  
  Handles three scenarios:
    1. Entity-scoped with target_entity_id: Deduct from specific entity in rollover
    2. Entity-scoped without target_entity_id: Deduct from all entities in rollover
    3. Top-level balance: Deduct from rollover.balance
  
  params:
    context: table (context object with rollovers indexed)
    rollovers: {id: string, credit_cost: number}[] (rollovers with credit_cost)
    amount: number (amount to deduct, in feature units)
    target_entity_id: string | nil
    has_entity_scope: boolean
    
  Returns:
    deducted: number (total amount deducted from rollovers, in FEATURE units)
]]
local function deduct_from_rollovers(params)
  local context = params.context
  local rollovers = params.rollovers
  local amount = params.amount
  local target_entity_id = params.target_entity_id
  local has_entity_scope = params.has_entity_scope
  local logger = context.logger
  
  -- Early return if no rollovers or no amount
  if not rollovers or #rollovers == 0 or amount <= 0 then
    return 0
  end
  
  local remaining = amount  -- in feature units
  local deducted = 0  -- in feature units
  
  logger.log("=== ROLLOVER DEDUCTION START ===")
  local ids_str = ""
  for i, r in ipairs(rollovers) do
    if i > 1 then ids_str = ids_str .. ", " end
    ids_str = ids_str .. r.id .. "(cost=" .. tostring(r.credit_cost or 1) .. ")"
  end
  logger.log("  rollovers: %s", ids_str)
  logger.log("  amount: %s, has_entity_scope: %s, target_entity_id: %s", 
    tostring(amount), tostring(has_entity_scope), tostring(target_entity_id or "nil"))
  
  -- Loop through rollovers in order (already sorted by expires_at)
  for _, rollover_obj in ipairs(rollovers) do
    if remaining <= 0 then break end
    
    local rollover_id = rollover_obj.id
    local credit_cost = rollover_obj.credit_cost or 1
    
    local rollover_data = context.rollovers[rollover_id]
    if not rollover_data then
      logger.log("  Rollover %s not found in context", rollover_id)
    else
      local base_path = rollover_data.base_path
      
      -- Convert remaining (feature units) to credits for this rollover
      local remaining_credits = remaining * credit_cost
      
      -- ========================================================================
      -- CASE 1: Entity-scoped with specific target entity
      -- ========================================================================
      if has_entity_scope and not is_nil(target_entity_id) then
        local entities = rollover_data.entities or {}
        local entity_obj = entities[target_entity_id]
        local balance = entity_obj and safe_number(entity_obj.balance) or 0
        
        local to_change = calculate_rollover_change(balance, remaining_credits)
        
        logger.log("  Rollover %s entity %s: balance=%s, credit_cost=%s, to_change=%s", 
          rollover_id, target_entity_id, balance, credit_cost, to_change)
        
        if to_change > 0 then
          local entity_path = base_path .. '["entities"]["' .. target_entity_id .. '"]'
          
          queue_rollover_update({
            context = context,
            path = entity_path,
            deduct_amount = to_change,
          })
          
          update_in_memory_rollover({
            target = entities,
            entity_id = target_entity_id,
            deduct_amount = to_change,
          })
          
          -- Convert credits deducted back to features
          local features = to_change / credit_cost
          deducted = deducted + features
          remaining = remaining - features
        end
        
      -- ========================================================================
      -- CASE 2: Entity-scoped without target (all entities)
      -- ========================================================================
      elseif has_entity_scope then
        local entities = rollover_data.entities or {}
        local entity_keys = sorted_keys(entities)
        
        for _, entity_key in ipairs(entity_keys) do
          if remaining <= 0 then break end
          
          -- Recalculate remaining_credits (remaining may have changed)
          remaining_credits = remaining * credit_cost
          
          local entity_obj = entities[entity_key]
          local balance = entity_obj and safe_number(entity_obj.balance) or 0
          
          local to_change = calculate_rollover_change(balance, remaining_credits)
          
          logger.log("  Rollover %s entity %s: balance=%s, credit_cost=%s, to_change=%s", 
            rollover_id, entity_key, balance, credit_cost, to_change)
          
          if to_change > 0 then
            local entity_path = base_path .. '["entities"]["' .. entity_key .. '"]'
            
            queue_rollover_update({
              context = context,
              path = entity_path,
              deduct_amount = to_change,
            })
            
            update_in_memory_rollover({
              target = entities,
              entity_id = entity_key,
              deduct_amount = to_change,
            })
            
            local features = to_change / credit_cost
            deducted = deducted + features
            remaining = remaining - features
          end
        end
        
      -- ========================================================================
      -- CASE 3: Top-level balance (no entity scope)
      -- ========================================================================
      else
        local balance = safe_number(rollover_data.balance)
        
        local to_change = calculate_rollover_change(balance, remaining_credits)
        
        logger.log("  Rollover %s top-level: balance=%s, credit_cost=%s, to_change=%s", 
          rollover_id, balance, credit_cost, to_change)
        
        if to_change > 0 then
          queue_rollover_update({
            context = context,
            path = base_path,
            deduct_amount = to_change,
          })
          
          update_in_memory_rollover({
            target = rollover_data,
            entity_id = nil,
            deduct_amount = to_change,
          })
          
          local features = to_change / credit_cost
          deducted = deducted + features
          remaining = remaining - features
        end
      end
    end
  end
  
  logger.log("=== ROLLOVER DEDUCTION END === deducted=%s", deducted)
  
  return deducted
end
