-- Merge selector/snapshot fields into the customer's sync dirty hash, refresh
-- its TTL, then attempt to set the signal marker (NX + TTL). Returns 1 when the
-- marker was newly set (no signal believed in flight), else 0.
-- uw:* fields carry {ts, snapshot} JSON: an older snapshot never overwrites a
-- newer one (cross-process batches can arrive out of order).
-- KEYS[1] dirty hash, KEYS[2] signal marker
-- ARGV[1] signal TTL seconds, ARGV[2] dirty TTL seconds, ARGV[3..] field/value pairs
local dirtyKey = KEYS[1]
local signalKey = KEYS[2]
local signalTtl = tonumber(ARGV[1])
local dirtyTtl = tonumber(ARGV[2])
for i = 3, #ARGV, 2 do
  local field = ARGV[i]
  local value = ARGV[i + 1]
  if string.sub(field, 1, 3) == 'uw:' then
    local existing = redis.call('HGET', dirtyKey, field)
    if not existing or cjson.decode(value).ts >= cjson.decode(existing).ts then
      redis.call('HSET', dirtyKey, field, value)
    end
  else
    redis.call('HSET', dirtyKey, field, value)
  end
end
redis.call('EXPIRE', dirtyKey, dirtyTtl)
local set = redis.call('SET', signalKey, '1', 'NX', 'EX', signalTtl)
if set then return 1 end
return 0
