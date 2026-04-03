-- ============================================================================
-- LUA UTILITIES
-- Generic helper functions (no FullCustomer-specific logic)
-- ============================================================================

local function safe_table(val)
  if val == nil or val == cjson.null or type(val) ~= 'table' then
    return {}
  end
  return val
end

local function safe_number(val)
  if val == nil or val == cjson.null then
    return 0
  end
  return tonumber(val) or 0
end

local function is_nil(val)
  return val == nil or val == cjson.null
end

local function sorted_keys(tbl)
  local keys = {}
  for k in pairs(tbl) do
    table.insert(keys, k)
  end
  table.sort(keys)
  return keys
end
