--[[
  Lua Script: Upsert Invoice in FullSubject V2 cache

  Atomically upserts an invoice in the cached FullSubject invoices array:
  - If invoice with same stripe_id exists: replace it
  - Otherwise: append

  KEYS[1] = FullSubject cache key

  ARGV[1] = JSON-encoded invoice object (must have stripe_id for match/replace)
  ARGV[2] = cache TTL in seconds
  ARGV[3] = current timestamp in ms (reserved for consistency)

  Returns JSON:
    { "success": true, "action": "appended" }
    { "success": true, "action": "updated" }
    { "success": false, "cache_miss": true }
]]

local subject_key = KEYS[1]
local invoice_json = ARGV[1]
local cache_ttl = tonumber(ARGV[2])

local current_raw = redis.call("GET", subject_key)
if not current_raw then
  return cjson.encode({ success = false, cache_miss = true })
end

local cached = cjson.decode(current_raw)
local invoice = cjson.decode(invoice_json)
local stripe_id = invoice.stripe_id

local invoices = cached.invoices
if type(invoices) ~= "table" then
  invoices = {}
end

local function invoice_created_at(invoice_row)
  if type(invoice_row) ~= "table" then
    return 0
  end

  local created_at = tonumber(invoice_row.created_at)
  if created_at == nil then
    return 0
  end

  return created_at
end

local function invoice_id(invoice_row)
  if type(invoice_row) ~= "table" then
    return ""
  end

  if type(invoice_row.id) == "string" then
    return invoice_row.id
  end

  return ""
end

local did_update = false

if stripe_id then
  for index, existing_invoice in ipairs(invoices) do
    if type(existing_invoice) == "table" and existing_invoice.stripe_id == stripe_id then
      invoices[index] = invoice
      did_update = true
      break
    end
  end
end

if not did_update then
  table.insert(invoices, invoice)
end

-- Keep cached invoice ordering aligned with DB query ordering:
-- created_at DESC, id DESC.
table.sort(invoices, function(a, b)
  local a_created_at = invoice_created_at(a)
  local b_created_at = invoice_created_at(b)

  if a_created_at ~= b_created_at then
    return a_created_at > b_created_at
  end

  local a_id = invoice_id(a)
  local b_id = invoice_id(b)
  return a_id > b_id
end)

while #invoices > 10 do
  table.remove(invoices)
end

cached.invoices = invoices

redis.call("SET", subject_key, cjson.encode(cached), "EX", cache_ttl)

if did_update then
  return cjson.encode({ success = true, action = "updated" })
end

return cjson.encode({ success = true, action = "appended" })
