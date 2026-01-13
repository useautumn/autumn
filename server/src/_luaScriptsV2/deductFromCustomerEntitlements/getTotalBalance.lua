-- ============================================================================
-- GET TOTAL BALANCE
-- Calculates total balance across all entitlements
-- Mirrors logic from getTotalBalance.sql (excluding rollovers)
-- ============================================================================

--[[
  get_total_balance(params)
  
  Calculates the total balance across all customer entitlements.
  Handles both entity-scoped and customer-level entitlements.
  
  params:
    context: table (context object with customer_entitlements)
    sorted_entitlements: array of entitlement objects
    target_entity_id: string or nil (if entity-scoped, which entity to sum)
    
  Returns: number (total balance)
]]
local function get_total_balance(params)
  local context = params.context
  local sorted_entitlements = params.sorted_entitlements
  local target_entity_id = params.target_entity_id
  
  local total_balance = 0
  
  for _, ent_obj in ipairs(sorted_entitlements) do
    local ent_id = ent_obj.customer_entitlement_id
    local ent_data = context.customer_entitlements[ent_id]
    
    if ent_data then
      if ent_data.has_entity_scope then
        -- Entity-scoped: sum entity balances
        if not is_nil(target_entity_id) then
          -- Specific entity only
          local entity_data = ent_data.entities and ent_data.entities[target_entity_id]
          if entity_data then
            local entity_balance = safe_number(entity_data.balance)
            total_balance = total_balance + entity_balance
          end
        else
          -- Sum across all entities
          for entity_id, entity_data in pairs(ent_data.entities or {}) do
            local entity_balance = safe_number(entity_data.balance)
            total_balance = total_balance + entity_balance
          end
        end
      else
        -- Customer-level: use balance directly
        local current_balance = safe_number(ent_data.balance)
        total_balance = total_balance + current_balance
      end
    end
  end
  
  return total_balance
end
