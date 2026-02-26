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

-- Atomic relative increment (JSON.NUMINCRBY with $ path returns a JSON array e.g. "[105]")
local result = redis.call('JSON.NUMINCRBY', cache_key, balance_path, delta)
local new_balance = cjson.decode(result)[1]

-- Bump cache_version so sync_balances_v2 conflict detection stays in sync
-- with CusEntService.increment (which bumps Postgres cache_version atomically).
local version_path = base_path .. '.cache_version'
local version_result = redis.call('JSON.NUMINCRBY', cache_key, version_path, 1)
local new_cache_version = cjson.decode(version_result)[1]

return cjson.encode({ ok = true, new_balance = new_balance, new_cache_version = new_cache_version })
