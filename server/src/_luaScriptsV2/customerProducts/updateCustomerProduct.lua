--[[
  Lua Script: Update Customer Product Fields in Cache

  Atomically updates specific fields on a cusProduct in the cached
  FullCustomer. Matches by cusProduct id, then applies targeted
  JSON.SET on each provided field.

  CRDT Safety Note (Active-Active Redis):
  - JSON.SET on specific paths follows "Update versus update" conflict
    resolution (smallest instance ID wins) — safe for field-level updates.
  - We never overwrite the entire cusProduct object.

  KEYS[1] = FullCustomer cache key

  ARGV[1] = JSON: { cus_product_id: string, updates: { field: value, ... } }
             Supported fields: status, canceled, canceled_at, ended_at,
             subscription_ids, scheduled_ids, options, quantity,
             entity_id, internal_entity_id, trial_ends_at, collection_method

  Returns JSON:
    { "ok": true, "updated_count": number }
    { "ok": false, "error": string }
]]

local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])

local cus_product_id = params.cus_product_id
local updates = params.updates

if not cus_product_id then
  return cjson.encode({ ok = false, error = "missing cus_product_id" })
end

if not updates then
  return cjson.encode({ ok = false, error = "missing updates" })
end

-- Read the full customer to find the matching cusProduct index
local raw = redis.call('JSON.GET', cache_key, '.')
if not raw then
  return cjson.encode({ ok = false, error = "cache_miss" })
end

local full_customer = cjson.decode(raw)

if not full_customer.customer_products then
  return cjson.encode({ ok = false, error = "no_customer_products" })
end

-- Find cusProduct by id. Returns (cus_product, 0-indexed position) or (nil, nil).
local function find_customer_product(customer_products, id)
  for idx, cp in ipairs(customer_products) do
    if cp.id == id then
      return cp, idx - 1
    end
  end
  return nil, nil
end

local _, cp_idx = find_customer_product(full_customer.customer_products, cus_product_id)

if cp_idx == nil then
  return cjson.encode({ ok = false, error = "cus_product_not_found" })
end

local base_path = '$.customer_products[' .. cp_idx .. '].'
local updated_count = 0

-- Apply each update field via targeted JSON.SET
for field, value in pairs(updates) do
  redis.call('JSON.SET', cache_key, base_path .. field, cjson.encode(value))
  updated_count = updated_count + 1
end

return cjson.encode({ ok = true, updated_count = updated_count })
