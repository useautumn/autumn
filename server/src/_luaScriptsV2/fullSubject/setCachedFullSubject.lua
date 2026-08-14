--[[
  Atomically set a FullSubject cache: subject view + all balance hashes.

  Guarantees no partial-write window: either everything is written or nothing.

  KEYS[1] = subjectKey (existence check + subject view write)
  KEYS[2] = epochKey (staleness check)
  KEYS[3] = customer balance-generation key
  KEYS[4] = attach handoff lock
  KEYS[5..N] = balance hash keys (one per metered feature)

  ARGV[1] = expected epoch value
  ARGV[2] = TTL seconds (applies to subject key and all balance keys)
  ARGV[3] = epoch TTL seconds (applied to epoch key)
  ARGV[4] = subject view JSON string
  ARGV[5] = expected balance generation
  ARGV[6] = number of balance keys (N - 4)
  ARGV[7..M] = for each balance key: field_count, then field_count pairs of (field_name, field_value_json)

  Returns:
    "OK" = all keys written
    "CACHE_EXISTS" = subject key already exists, nothing written
    "HANDOFF_IN_PROGRESS" = an attach owns the missing customer view
    "STALE_WRITE" = epoch or generation mismatch, nothing written
]]

local subject_key = KEYS[1]
local epoch_key = KEYS[2]
local generation_key = KEYS[3]
local handoff_lock_key = KEYS[4]
local expected_epoch = ARGV[1]
local ttl = tonumber(ARGV[2])
local epoch_ttl = tonumber(ARGV[3])
local subject_view_json = ARGV[4]
local expected_generation = ARGV[5]
local num_balance_keys = tonumber(ARGV[6])

if redis.call('EXISTS', subject_key) == 1 then
  return 'CACHE_EXISTS'
end

local raw_handoff_lock = redis.call('GET', handoff_lock_key)
if raw_handoff_lock ~= false then
  local lock_ok, handoff_lock = pcall(cjson.decode, raw_handoff_lock)
  if lock_ok and type(handoff_lock) == 'table' and handoff_lock.owner == 'attach' then
    return 'HANDOFF_IN_PROGRESS'
  end
end

local current_epoch = redis.call('GET', epoch_key)
if current_epoch ~= false and current_epoch ~= expected_epoch then
  return 'STALE_WRITE'
end

redis.call('SETNX', generation_key, '0')
if redis.call('GET', generation_key) ~= expected_generation then
  return 'STALE_WRITE'
end

local argv_index = 7

for i = 1, num_balance_keys do
  local balance_key = KEYS[4 + i]
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

redis.call('EXPIRE', epoch_key, epoch_ttl)

return 'OK'
