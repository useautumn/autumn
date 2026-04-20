--[[
  Atomically set a FullSubject cache: subject view + all balance hashes.

  Guarantees no partial-write window: either everything is written or nothing.

  KEYS[1] = subjectKey (existence check + subject view write)
  KEYS[2] = epochKey (staleness check)
  KEYS[3..N] = balance hash keys (one per metered feature)

  ARGV[1] = expected epoch value
  ARGV[2] = TTL seconds (applies to subject key and all balance keys)
  ARGV[3] = subject view JSON string
  ARGV[4] = number of balance keys (N - 2)
  ARGV[5..M] = for each balance key: field_count, then field_count pairs of (field_name, field_value_json)

  Returns:
    "OK" = all keys written
    "CACHE_EXISTS" = subject key already exists, nothing written
    "STALE_WRITE" = epoch mismatch, nothing written
]]

local subject_key = KEYS[1]
local epoch_key = KEYS[2]
local expected_epoch = ARGV[1]
local ttl = tonumber(ARGV[2])
local subject_view_json = ARGV[3]
local num_balance_keys = tonumber(ARGV[4])

if redis.call('EXISTS', subject_key) == 1 then
  return 'CACHE_EXISTS'
end

local current_epoch = redis.call('GET', epoch_key)
if current_epoch ~= false and current_epoch ~= expected_epoch then
  return 'STALE_WRITE'
end

local argv_index = 5

for i = 1, num_balance_keys do
  local balance_key = KEYS[2 + i]
  local field_count = tonumber(ARGV[argv_index])
  argv_index = argv_index + 1

  if field_count > 0 then
    for j = 1, field_count do
      local field_name = ARGV[argv_index]
      local field_value = ARGV[argv_index + 1]
      redis.call('HSETNX', balance_key, field_name, field_value)
      argv_index = argv_index + 2
    end
  end

  redis.call('EXPIRE', balance_key, ttl)
end

redis.call('SET', subject_key, subject_view_json, 'EX', ttl)

return 'OK'
