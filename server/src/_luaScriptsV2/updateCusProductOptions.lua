-- ============================================================================
-- UPDATE CUSTOMER PRODUCT OPTIONS QUANTITY
-- Atomically increments a cusProduct's options[].quantity in the cached
-- FullCustomer JSON using JSON.NUMINCRBY.
-- ============================================================================
-- KEYS[1] = fullCustomer cache key
-- ARGV[1] = JSON: { internal_feature_id: string, feature_id: string, delta: number }
-- Returns:  JSON: { ok: true, new_quantity: number } | { ok: false, error: string }
-- ============================================================================

local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])

local internal_feature_id = params.internal_feature_id
local feature_id = params.feature_id
local delta = tonumber(params.delta)

if not delta then
  return cjson.encode({ ok = false, error = "missing delta" })
end

if not internal_feature_id and not feature_id then
  return cjson.encode({ ok = false, error = "missing internal_feature_id and feature_id" })
end

-- Read the full customer to find the matching options entry
local raw = redis.call('JSON.GET', cache_key, '.')
if not raw then
  return cjson.encode({ ok = false, error = "cache_miss" })
end

local full_customer = cjson.decode(raw)

if not full_customer.customer_products then
  return cjson.encode({ ok = false, error = "no_customer_products" })
end

-- Iterate customer_products and their options to find the matching entry
for cp_idx, cus_product in ipairs(full_customer.customer_products) do
  if cus_product.options then
    for opt_idx, option in ipairs(cus_product.options) do
      local matches = false
      if internal_feature_id and option.internal_feature_id == internal_feature_id then
        matches = true
      end
      if not matches and feature_id and option.feature_id == feature_id then
        matches = true
      end

      if matches then
        -- Lua arrays are 1-indexed, RedisJSON is 0-indexed
        local path = '$.customer_products[' .. (cp_idx - 1) .. '].options[' .. (opt_idx - 1) .. '].quantity'
        local result = redis.call('JSON.NUMINCRBY', cache_key, path, delta)
        local new_quantity = cjson.decode(result)[1]
        return cjson.encode({ ok = true, new_quantity = new_quantity })
      end
    end
  end
end

return cjson.encode({ ok = false, error = "options_entry_not_found" })
