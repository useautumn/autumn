-- Per-file Stripe counters for bun tw; read back by scripts/tw/worker/runTestFileWithStats.ts.
local fileStats, fileInFlight, machineStats, machineInFlight = unpack(KEYS)
local operation, id, attributed, source = ARGV[1], ARGV[2], ARGV[3] == '1', ARGV[4]
local waitMs, leaseMs, waitBucket = tonumber(ARGV[5]), tonumber(ARGV[6]), ARGV[7]
local rateLimited, reason = ARGV[8] == '1', ARGV[9]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local second = tostring(math.floor(now / 1000))

local function raiseTo(key, field, value)
  local current = tonumber(redis.call('HGET', key, field)) or 0
  if value > current then redis.call('HSET', key, field, value) end
end

local function track(key)
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
  redis.call('ZADD', key, now + leaseMs, id)
  return redis.call('ZCARD', key)
end

if operation == 'release' then
  redis.call('ZREM', machineInFlight, id)
  if attributed then redis.call('ZREM', fileInFlight, id) end
  if rateLimited then
    redis.call('HINCRBY', machineStats, 'r:' .. second, 1)
    if attributed then
      redis.call('HINCRBY', fileStats, 'r429', 1)
      redis.call('HINCRBY', fileStats, 'rl:' .. reason, 1)
    else
      redis.call('HINCRBY', machineStats, 'ur:' .. second, 1)
    end
  end
  return 0
end

raiseTo(machineStats, 'i:' .. second, track(machineInFlight))
if attributed then
  redis.call('HINCRBY', machineStats, 'a:' .. second, 1)
  redis.call('HINCRBY', fileStats, 'req_' .. source, 1)
  redis.call('HINCRBY', fileStats, 's:' .. second, 1)
  redis.call('HINCRBY', fileStats, 'wait_sum', waitMs)
  redis.call('HINCRBY', fileStats, 'h:' .. waitBucket, 1)
  raiseTo(fileStats, 'wait_max', waitMs)
  raiseTo(fileStats, 'inflight_max', track(fileInFlight))
else
  redis.call('HINCRBY', machineStats, 'u:' .. second, 1)
  redis.call('HINCRBY', machineStats, 'uw:' .. second, waitMs)
end
for _, key in ipairs(KEYS) do redis.call('PEXPIRE', key, 7200000) end
return 1
