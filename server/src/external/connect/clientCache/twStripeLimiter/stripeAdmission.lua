local state, bulk, webhook, waiting, active, activeBulk = unpack(KEYS)
local operation, id, lane = ARGV[1], ARGV[2], ARGV[3]
local interval, maximum, lease = tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + tonumber(time[2]) / 1000

local function removeWaiting(requestId)
  redis.call('ZREM', bulk, requestId)
  redis.call('ZREM', webhook, requestId)
  redis.call('ZREM', waiting, requestId)
end

local function extendExpiry()
  local ttl = math.max(lease, 30000) + 30000
  for _, key in ipairs(KEYS) do
    if redis.call('PTTL', key) < ttl then redis.call('PEXPIRE', key, ttl) end
  end
end

if operation == 'release' then
  removeWaiting(id)
  redis.call('ZREM', active, id)
  redis.call('ZREM', activeBulk, id)
  return {0, 0}
end

local configuredInterval = tonumber(redis.call('HGET', state, 'interval'))
local configuredMaximum = tonumber(redis.call('HGET', state, 'maximum'))
if configuredInterval and (configuredInterval ~= interval or configuredMaximum ~= maximum) then
  return redis.error_reply('Stripe budget differs between worker processes')
end
redis.call('HSET', state, 'interval', interval, 'maximum', maximum)

for _, expired in ipairs(redis.call('ZRANGEBYSCORE', waiting, '-inf', now)) do
  removeWaiting(expired)
end
redis.call('ZREMRANGEBYSCORE', active, '-inf', now)
redis.call('ZREMRANGEBYSCORE', activeBulk, '-inf', now)

local queue = lane == 'webhook' and webhook or bulk
if not redis.call('ZSCORE', queue, id) then
  local sequence = redis.call('HINCRBY', state, 'sequence', 1)
  redis.call('ZADD', queue, sequence, id)
end
redis.call('ZADD', waiting, now + 30000, id)
extendExpiry()

local bulkHead = redis.call('ZRANGE', bulk, 0, 0)[1]
local webhookHead = redis.call('ZRANGE', webhook, 0, 0)[1]
local streak = tonumber(redis.call('HGET', state, 'webhookStreak')) or 0
-- A Stripe mutation can wait for a webhook, so bulk must leave one slot free.
local bulkHasCapacity = redis.call('ZCARD', activeBulk) < maximum - 1
local selected = bulkHead
if webhookHead and (not bulkHead or streak < 3 or not bulkHasCapacity) then
  selected = webhookHead
end

local nextAt = tonumber(redis.call('HGET', state, 'nextAt')) or 0
local rank = redis.call('ZRANK', queue, id) or 0
local delay = math.max(1, nextAt - now)
if selected ~= id then
  return {0, math.ceil(math.max(delay, math.min(1000, interval * (rank + 1))))}
end
if redis.call('ZCARD', active) >= maximum or (lane == 'bulk' and not bulkHasCapacity) then
  return {0, math.ceil(math.max(delay, interval))}
end
if now < nextAt then return {0, math.ceil(delay)} end

removeWaiting(id)
redis.call('ZADD', active, now + lease, id)
if lane == 'bulk' then redis.call('ZADD', activeBulk, now + lease, id) end
redis.call('HSET', state, 'nextAt', now + interval, 'webhookStreak', lane == 'webhook' and streak + 1 or 0)
extendExpiry()
return {1, 0}
