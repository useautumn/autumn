-- ============================================================================
-- INCREMENT CUSTOMER ENTITLEMENT BALANCE
-- Atomically increments a cusEnt's balance in the cached FullCustomer JSON
-- using JSON.NUMINCRBY (relative delta, safe with concurrent deductions).
-- ============================================================================
-- KEYS[1] = fullCustomer cache key
-- ARGV[1] = JSON: { cus_ent_id: string, delta: number }
-- Returns:  JSON: { ok: true, new_balance: number } | { ok: false, error: string }
-- ============================================================================

local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])

local cus_ent_id = params.cus_ent_id
local delta = tonumber(params.delta)

if not cus_ent_id or not delta then
  return cjson.encode({ ok = false, error = "missing cus_ent_id or delta" })
end

-- Read the full customer to find the entitlement indices
local raw = redis.call('JSON.GET', cache_key, '.')
if not raw then
  return cjson.encode({ ok = false, error = "cache_miss" })
end

local full_customer = cjson.decode(raw)
local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, cus_ent_id)

if not cus_ent then
  return cjson.encode({ ok = false, error = "cus_ent_not_found" })
end

-- Build the JSON path to the balance field
local base_path
if cp_idx then
  -- Lua arrays are 1-indexed, RedisJSON is 0-indexed
  base_path = '$.customer_products[' .. (cp_idx - 1) .. '].customer_entitlements[' .. (ce_idx - 1) .. ']'
else
  base_path = '$.extra_customer_entitlements[' .. (ce_idx - 1) .. ']'
end

local balance_path = base_path .. '.balance'

-- Atomic relative increment
local new_balance = redis.call('JSON.NUMINCRBY', cache_key, balance_path, delta)

return cjson.encode({ ok = true, new_balance = tonumber(new_balance) })
