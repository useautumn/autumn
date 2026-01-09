-- ============================================================================
-- LUA UTILITIES
-- Common helper functions for Lua scripts
-- ============================================================================

-- ============================================================================
-- HELPER: Safe table getter (handles cjson.null)
-- ============================================================================
local function safe_table(val)
  if val == nil or val == cjson.null or type(val) ~= 'table' then
    return {}
  end
  return val
end

-- ============================================================================
-- HELPER: Safe number getter
-- ============================================================================
local function safe_number(val)
  if val == nil or val == cjson.null then
    return 0
  end
  return tonumber(val) or 0
end

-- ============================================================================
-- HELPER: Find entitlement in FullCustomer by ID
-- Returns: cus_ent table, cus_product table, cus_ent_index, cus_product_index
-- ============================================================================
local function find_entitlement(full_customer, ent_id)
  if not full_customer.customer_products then return nil, nil, nil, nil end
  
  for cp_idx, cus_product in ipairs(full_customer.customer_products) do
    if cus_product.customer_entitlements then
      for ce_idx, cus_ent in ipairs(cus_product.customer_entitlements) do
        if cus_ent.id == ent_id then
          return cus_ent, cus_product, ce_idx, cp_idx
        end
      end
    end
  end
  return nil, nil, nil, nil
end

-- ============================================================================
-- HELPER: Build entity path (consistent across all operations)
-- ============================================================================
local function build_entity_path(base_path, entity_id)
  -- Use bracket notation for entity access since entity IDs are object keys
  return base_path .. '["entities"]["' .. entity_id .. '"]'
end

-- ============================================================================
-- HELPER: Get sorted keys from table (for consistent entity iteration)
-- ============================================================================
local function sorted_keys(tbl)
  local keys = {}
  for k in pairs(tbl) do
    table.insert(keys, k)
  end
  table.sort(keys)
  return keys
end
