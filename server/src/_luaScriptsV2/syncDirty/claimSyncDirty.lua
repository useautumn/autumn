-- Atomically claim the customer's dirty state for a drain: move dirty -> claim,
-- merging any leftover claim from a crashed worker (uw:* snapshots keep the
-- newer ts; other marker fields are a no-op union). Stamps a fresh generation
-- token for compare-and-delete, clears the signal marker so post-claim writes
-- re-signal, and returns the full claim hash (or nil when empty).
-- KEYS[1] dirty hash, KEYS[2] claim hash, KEYS[3] signal marker
-- ARGV[1] claim TTL seconds, ARGV[2] generation token
local dirtyKey = KEYS[1]
local claimKey = KEYS[2]
local signalKey = KEYS[3]
local claimTtl = tonumber(ARGV[1])
local generation = ARGV[2]
if redis.call('EXISTS', dirtyKey) == 1 then
  if redis.call('EXISTS', claimKey) == 1 then
    local fields = redis.call('HGETALL', dirtyKey)
    for i = 1, #fields, 2 do
      local field = fields[i]
      local value = fields[i + 1]
      if string.sub(field, 1, 3) == 'uw:' then
        local existing = redis.call('HGET', claimKey, field)
        if not existing or cjson.decode(value).ts >= cjson.decode(existing).ts then
          redis.call('HSET', claimKey, field, value)
        end
      else
        redis.call('HSET', claimKey, field, value)
      end
    end
    redis.call('DEL', dirtyKey)
  else
    redis.call('RENAME', dirtyKey, claimKey)
  end
end
redis.call('DEL', signalKey)
if redis.call('EXISTS', claimKey) == 1 then
  redis.call('HSET', claimKey, '__gen', generation)
  redis.call('EXPIRE', claimKey, claimTtl)
  return redis.call('HGETALL', claimKey)
end
return nil
