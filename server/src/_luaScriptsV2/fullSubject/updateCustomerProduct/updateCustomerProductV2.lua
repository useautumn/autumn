--[[
  Lua Script: Update Customer Product in FullSubject V2 cache

  Atomically updates specific fields on a customer product inside a cached
  FullSubject payload stored as a plain Redis string.

  KEYS[1] = full subject key

  ARGV[1] = JSON params:
    {
      cus_product_id: string,
      updates: { field: value, ... }
    }
  ARGV[2] = cache TTL in seconds
  ARGV[3] = current timestamp in ms (reserved for consistency)

  Returns JSON:
    { "success": true, "updated_fields": ["options", "status"] }
    { "success": false, "cache_miss": true }
    { "success": false, "cus_product_not_found": true }
]]

local subject_key = KEYS[1]
local request_params = cjson.decode(ARGV[1])
local cache_ttl = tonumber(ARGV[2])

local customer_product_id = request_params.cus_product_id
local updates = request_params.updates

if not customer_product_id then
  return cjson.encode({ success = false, error = "missing_cus_product_id" })
end

if not updates then
  return cjson.encode({ success = false, error = "missing_updates" })
end

local has_updates = false
for _ in pairs(updates) do
  has_updates = true
  break
end

if not has_updates then
  return cjson.encode({ success = true, updated_fields = {} })
end

local current_raw = redis.call("GET", subject_key)
if not current_raw then
  return cjson.encode({ success = false, cache_miss = true })
end

local cached_subject = cjson.decode(current_raw)
local customer_products = cached_subject.customer_products

if type(customer_products) ~= "table" then
  return cjson.encode({ success = false, cus_product_not_found = true })
end

local target_index = nil
for index, customer_product in ipairs(customer_products) do
  if customer_product.id == customer_product_id then
    target_index = index
    break
  end
end

if not target_index then
  return cjson.encode({ success = false, cus_product_not_found = true })
end

local target_customer_product = customer_products[target_index]
local updated_fields = {}

for field_name, field_value in pairs(updates) do
  if field_name == "options" then
    update_customer_product_options({
      customer_product = target_customer_product,
      options = field_value,
    })
  else
    target_customer_product[field_name] = field_value
  end

  table.insert(updated_fields, field_name)
end

customer_products[target_index] = target_customer_product
cached_subject.customer_products = customer_products

redis.call("SET", subject_key, cjson.encode(cached_subject), "EX", cache_ttl)

return cjson.encode({
  success = true,
  updated_fields = updated_fields,
})
