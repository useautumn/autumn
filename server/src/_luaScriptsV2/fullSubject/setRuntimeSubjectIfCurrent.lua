local subject_key = KEYS[1]
local epoch_key = KEYS[2]
local runtime_subject_key = KEYS[3]
local expected_epoch = ARGV[1]
local ttl = tonumber(ARGV[2])
local field_count = tonumber(ARGV[3])

if redis.call('EXISTS', subject_key) == 0 then
  return 'CACHE_MISSING'
end

local current_epoch = redis.call('GET', epoch_key)
if current_epoch ~= false and current_epoch ~= expected_epoch then
  return 'STALE_WRITE'
end

local argv_index = 4
for i = 1, field_count do
  redis.call(
    'HSET',
    runtime_subject_key,
    ARGV[argv_index],
    ARGV[argv_index + 1]
  )
  argv_index = argv_index + 2
end

redis.call('EXPIRE', runtime_subject_key, ttl)
return 'OK'
