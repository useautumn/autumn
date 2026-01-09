-- ============================================================================
-- DEDUCT FROM ROLLOVERS
-- TODO: Implement rollover deduction logic (mirrors SQL deductFromRollovers.sql)
-- ============================================================================

--[[
  deduct_from_rollovers(params)
  
  Deducts from rollover balances before main entitlements.
  Currently a stub - returns 0 (rollovers not yet implemented in V2).
  
  params:
    cache_key: string
    rollover_ids: string[] | nil
    amount: number
    credit_cost: number
    target_entity_id: string | nil
    has_entity_scope: boolean
    
  Returns:
    deducted: number (amount deducted from rollovers)
]]
local function deduct_from_rollovers(params)
  -- Stub: rollovers not yet implemented in V2 Lua
  -- When implemented, should mirror server/src/internal/balances/utils/sql/deductFromRollovers.sql
  return 0
end
