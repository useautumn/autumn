-- ============================================================================
-- DEDUCT FROM ROLLOVERS
-- Deducts from rollover balances before main entitlements (mirrors SQL deductFromRollovers.sql)
-- ============================================================================

--[[
  deduct_from_rollovers(params)
  
  Deducts from rollover balances before main entitlements.
  Mirrors SQL logic in server/src/internal/balances/utils/sql/deductFromRollovers.sql
  
  Handles three scenarios:
    1. Entity-scoped with target_entity_id: Deduct from specific entity in rollover
    2. Entity-scoped without target_entity_id: Deduct from all entities in rollover
    3. Top-level balance: Deduct from rollover.balance
  
  params:
    context: table (context object with rollovers indexed)
    rollover_ids: string[] | nil
    amount: number (amount to deduct, in feature units, NOT credit-adjusted)
    target_entity_id: string | nil
    has_entity_scope: boolean
    
  Returns:
    deducted: number (total amount deducted from rollovers, in feature units)
]]
local function deduct_from_rollovers(params)
  local context = params.context
  local rollover_ids = params.rollover_ids
  local amount = params.amount
  local target_entity_id = params.target_entity_id
  local has_entity_scope = params.has_entity_scope
  local logger = context.logger
  
  -- Early return if no rollovers or no amount
  if not rollover_ids or #rollover_ids == 0 then
    return 0
  end
  
  if amount <= 0 then
    return 0
  end
  
  local remaining_amount = amount
  local total_deducted = 0
  
  logger.log("=== ROLLOVER DEDUCTION START ===")
  logger.log("  rollover_ids: %s", table.concat(rollover_ids, ", "))
  logger.log("  amount: %s, has_entity_scope: %s, target_entity_id: %s", 
    tostring(amount), tostring(has_entity_scope), tostring(target_entity_id or "nil"))
  
  -- Loop through rollover IDs in order (already sorted by expires_at)
  for _, rollover_id in ipairs(rollover_ids) do
    if remaining_amount <= 0 then break end
    
    local rollover_data = context.rollovers[rollover_id]
    if not rollover_data then
      logger.log("  Rollover %s not found in context", rollover_id)
    else
      local base_path = rollover_data.base_path
      
      -- ========================================================================
      -- CASE 1: Entity-scoped with specific target entity
      -- ========================================================================
      if has_entity_scope and not is_nil(target_entity_id) then
        local entities = rollover_data.entities or {}
        local entity_obj = entities[target_entity_id]
        local entity_balance = entity_obj and safe_number(entity_obj.balance) or 0
        
        -- Calculate deduction (always cap at 0)
        local deduct_amount = math.min(entity_balance, remaining_amount)
        
        logger.log("  Rollover %s entity %s: balance=%s, deduct=%s", 
          rollover_id, target_entity_id, entity_balance, deduct_amount)
        
        if deduct_amount > 0 then
          local entity_path = base_path .. '["entities"]["' .. target_entity_id .. '"]'
          
          queue_rollover_update({
            context = context,
            path = entity_path,
            deduct_amount = deduct_amount,
          })
          
          update_in_memory_rollover({
            target = entities,
            entity_id = target_entity_id,
            deduct_amount = deduct_amount,
          })
          
          remaining_amount = remaining_amount - deduct_amount
          total_deducted = total_deducted + deduct_amount
        end
        
      -- ========================================================================
      -- CASE 2: Entity-scoped without target (all entities)
      -- ========================================================================
      elseif has_entity_scope then
        local entities = rollover_data.entities or {}
        local entity_keys = sorted_keys(entities)
        
        for _, entity_key in ipairs(entity_keys) do
          if remaining_amount <= 0 then break end
          
          local entity_obj = entities[entity_key]
          local entity_balance = entity_obj and safe_number(entity_obj.balance) or 0
          
          -- Calculate deduction for this entity (always cap at 0)
          local deduct_amount = math.min(entity_balance, remaining_amount)
          
          logger.log("  Rollover %s entity %s: balance=%s, deduct=%s", 
            rollover_id, entity_key, entity_balance, deduct_amount)
          
          if deduct_amount > 0 then
            local entity_path = base_path .. '["entities"]["' .. entity_key .. '"]'
            
            queue_rollover_update({
              context = context,
              path = entity_path,
              deduct_amount = deduct_amount,
            })
            
            update_in_memory_rollover({
              target = entities,
              entity_id = entity_key,
              deduct_amount = deduct_amount,
            })
            
            remaining_amount = remaining_amount - deduct_amount
            total_deducted = total_deducted + deduct_amount
          end
        end
        
      -- ========================================================================
      -- CASE 3: Top-level balance (no entity scope)
      -- ========================================================================
      else
        local current_balance = safe_number(rollover_data.balance)
        
        -- Calculate deduction (always cap at 0)
        local deduct_amount = math.min(current_balance, remaining_amount)
        
        logger.log("  Rollover %s top-level: balance=%s, deduct=%s", 
          rollover_id, current_balance, deduct_amount)
        
        if deduct_amount > 0 then
          queue_rollover_update({
            context = context,
            path = base_path,
            deduct_amount = deduct_amount,
          })
          
          update_in_memory_rollover({
            target = rollover_data,
            entity_id = nil,
            deduct_amount = deduct_amount,
          })
          
          remaining_amount = remaining_amount - deduct_amount
          total_deducted = total_deducted + deduct_amount
        end
      end
    end
  end
  
  logger.log("=== ROLLOVER DEDUCTION END === total_deducted=%s", total_deducted)
  
  return total_deducted
end
