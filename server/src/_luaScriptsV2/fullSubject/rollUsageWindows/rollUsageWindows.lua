--[[
  Lua Script: Roll usage-window counters in a per-feature hash

  Atomically patches rows in the reserved '_usage_windows' field: the lazy
  roll (post-getFullSubject) zeroes counts whose window closed and advances
  bounds/anchor to the current derivation. Atomicity matters because a
  concurrent deduction may be writing the same field.

  Fail-open: a missing/malformed field, or a row absent for a scope, is left
  untouched (the write path creates rows; the roll only maintains them).

  KEYS[1] = balance hash key
  ARGV[1] = JSON params:
    {
      now: number,
      ttl_seconds: number,
      rolls: [{
        internal_entity_id: string | null,   -- scope selector
        zero_usage: boolean,                 -- stored window closed: count dies
        window_start_at: number,
        window_end_at: number,
        anchor_customer_entitlement_id: string | null,
      }]
    }

  Returns JSON: { rolled: number }
]]

local params = cjson.decode(ARGV[1])
local now = safe_number(params.now)
local ttl_seconds = safe_number(params.ttl_seconds)

local USAGE_WINDOWS_FIELD = '_usage_windows'

local raw = redis.call('HGET', KEYS[1], USAGE_WINDOWS_FIELD)
if is_nil(raw) then
  return cjson.encode({ rolled = 0 })
end

local ok, windows = pcall(cjson.decode, raw)
if not ok or type(windows) ~= 'table' then
  return cjson.encode({ rolled = 0 })
end

local rolled = 0
for _, roll in ipairs(params.rolls or {}) do
  local roll_entity = roll.internal_entity_id
  for _, window in ipairs(windows) do
    if type(window) == 'table' then
      local window_entity = window.internal_entity_id
      local entities_match =
        (is_nil(roll_entity) and is_nil(window_entity))
        or roll_entity == window_entity
      if entities_match then
        if roll.zero_usage then
          window.usage = 0
        end
        window.window_start_at = roll.window_start_at
        window.window_end_at = roll.window_end_at
        window.anchor_customer_entitlement_id =
          roll.anchor_customer_entitlement_id
        window.updated_at = now
        rolled = rolled + 1
      end
    end
  end
end

if rolled == 0 then
  return cjson.encode({ rolled = 0 })
end

local encoded = #windows > 0 and cjson.encode(windows) or '[]'
redis.call('HSET', KEYS[1], USAGE_WINDOWS_FIELD, encoded)

if ttl_seconds > 0 and redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ttl_seconds)
end

return cjson.encode({ rolled = rolled })
