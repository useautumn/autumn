--[[
  Shared key builder functions for FullCustomer cache keys.
  
  NOTE: FULL_CUSTOMER_CACHE_VERSION is injected by luaScriptsV2.ts at load time
  (the __FULL_CUSTOMER_CACHE_VERSION__ placeholder is replaced with the real value).
]]

local FULL_CUSTOMER_CACHE_VERSION = "__FULL_CUSTOMER_CACHE_VERSION__"

local function build_full_customer_cache_key(org_id, env, customer_id)
  return "{" .. org_id .. "}:" .. env .. ":fullcustomer:" .. FULL_CUSTOMER_CACHE_VERSION .. ":" .. customer_id
end

local function build_guard_key(org_id, env, customer_id)
  return "{" .. org_id .. "}:" .. env .. ":fullcustomer:guard:" .. customer_id
end

local function build_test_guard_key(org_id, env, customer_id)
  return "{" .. org_id .. "}:" .. env .. ":test_full_customer_cache_guard:" .. customer_id
end

local function build_path_index_key(org_id, env, customer_id)
  return "{" .. org_id .. "}:" .. env .. ":fullcustomer:pathidx:" .. customer_id
end
