--[[
  Lua Script: Upsert Invoice in Customer Cache

  Atomically upserts an invoice in the customer's invoices array:
  - If invoice with same stripe_id exists: replace it via JSON.SET
  - Otherwise: append via JSON.ARRAPPEND

  CRDT Safety Note (Active-Active Redis):
  - JSON.ARRAPPEND follows "Update versus update array" conflict resolution
  - Resolution type: Merge - results from all instances are merged
  - JSON.SET on specific paths follows "Update versus update" (smallest instance ID wins)

  KEYS[1] = FullCustomer cache key

  ARGV[1] = JSON-encoded invoice object (must have stripe_id field)

  Returns JSON:
    { "success": true, "action": "appended" }
    { "success": true, "action": "updated" }
    { "success": false, "cache_miss": true }
]]

local cache_key = KEYS[1]
local invoice_json = ARGV[1]

-- Check if cache exists
local key_exists = redis.call('EXISTS', cache_key)
if key_exists == 0 then
  return cjson.encode({ success = false, cache_miss = true })
end

-- Parse the incoming invoice to get stripe_id for matching
local invoice = cjson.decode(invoice_json)
local stripe_id = invoice.stripe_id

-- Get current invoices array
local invoices_json = redis.call('JSON.GET', cache_key, '$.invoices')
if not invoices_json then
  -- invoices array doesn't exist, create it with the new invoice
  redis.call('JSON.SET', cache_key, '$.invoices', cjson.encode({invoice}))
  return cjson.encode({ success = true, action = "appended" })
end

-- Parse invoices array (JSON.GET with JSONPath returns array of results)
local invoices_wrapper = cjson.decode(invoices_json)
local invoices = invoices_wrapper[1] or {}

-- Search for existing invoice by stripe_id
if stripe_id then
  for idx, existing_invoice in ipairs(invoices) do
    if existing_invoice.stripe_id == stripe_id then
      -- Replace the entire invoice at this index
      local array_idx = idx - 1  -- JSON arrays are 0-indexed
      redis.call('JSON.SET', cache_key, '$.invoices[' .. array_idx .. ']', invoice_json)
      return cjson.encode({ success = true, action = "updated" })
    end
  end
end

-- No existing invoice found, append
redis.call('JSON.ARRAPPEND', cache_key, '$.invoices', invoice_json)

return cjson.encode({ success = true, action = "appended" })
