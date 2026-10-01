--[[
  Lua Script: Patch an allocation counter row in a per-feature hash

  Mirrors setAllocationCounters onto the cached '_usage_windows' field, so a
  re-fit never has to drop the hash (and any un-synced deductions in it):
  the live row gets the delta, a row from another window is replaced, a
  missing row is appended. No-op when the hash isn't cached.

  KEYS[1] = balance hash key
  ARGV[1] = JSON params:
    {
      now: number,
      counter: UsageWindow,   -- the counter as written to Postgres; usage = target
      usage_delta: number,    -- target minus the usage the writer read
    }

  Returns JSON: { patched: boolean }
]]

local params = cjson.decode(ARGV[1])
local now = safe_number(params.now)
local counter = params.counter
local usage_delta = safe_number(params.usage_delta)

local USAGE_WINDOWS_FIELD = '_usage_windows'

if redis.call('EXISTS', KEYS[1]) == 0 then
  return cjson.encode({ patched = false })
end

local windows = {}
local raw = redis.call('HGET', KEYS[1], USAGE_WINDOWS_FIELD)
if not is_nil(raw) then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then
    windows = decoded
  end
end

local function same_scope(window)
  local entities_match =
    (is_nil(counter.internal_entity_id) and is_nil(window.internal_entity_id))
    or counter.internal_entity_id == window.internal_entity_id
  return entities_match and window.filter_key == counter.filter_key
end

local existing = nil
for _, window in ipairs(windows) do
  if type(window) == 'table' and same_scope(window) then
    existing = window
    break
  end
end

if existing == nil then
  counter.usage = math.max(0, safe_number(counter.usage))
  counter.updated_at = now
  table.insert(windows, counter)
-- Same drift tolerance as setAllocationCounters, so a refit never drops un-synced usage.
elseif math.abs(safe_number(existing.window_start_at) - safe_number(counter.window_start_at))
      <= USAGE_WINDOW_BOUND_TOLERANCE_MS
    and math.abs(safe_number(existing.window_end_at) - safe_number(counter.window_end_at))
      <= USAGE_WINDOW_BOUND_TOLERANCE_MS then
  existing.usage = math.max(0, safe_number(existing.usage) + usage_delta)
  existing.window_start_at = counter.window_start_at
  existing.window_end_at = counter.window_end_at
  existing.anchor_customer_entitlement_id = counter.anchor_customer_entitlement_id
  existing.updated_at = now
else
  existing.usage = math.max(0, safe_number(counter.usage))
  existing.window_start_at = counter.window_start_at
  existing.window_end_at = counter.window_end_at
  existing.anchor_customer_entitlement_id = counter.anchor_customer_entitlement_id
  existing.updated_at = now
end

redis.call('HSET', KEYS[1], USAGE_WINDOWS_FIELD, cjson.encode(windows))

return cjson.encode({ patched = true })
