-- Atomically replace one cached subject view while preserving unrelated hash fields.
local params = cjson.decode(ARGV[1])
local subject_key = KEYS[1]
local epoch_key = KEYS[2]

if redis.call('EXISTS', subject_key) == 0 then
  return 'CACHE_MISSING'
end

local next_epoch = redis.call('INCR', epoch_key)
params.subject.subjectViewEpoch = next_epoch

for index, balance_hash in ipairs(params.balance_hashes) do
  local balance_key = KEYS[index + 2]

  for _, field_name in ipairs(balance_hash.deletes) do
    redis.call('HDEL', balance_key, field_name)
  end

  for field_name, field_value in pairs(balance_hash.writes) do
    redis.call('HSETNX', balance_key, field_name, field_value)
  end

  if redis.call('EXISTS', balance_key) == 1 then
    redis.call('EXPIRE', balance_key, params.ttl_seconds)
  end
end

redis.call('SET', subject_key, cjson.encode(params.subject), 'EX', params.ttl_seconds)
redis.call('EXPIRE', epoch_key, params.epoch_ttl_seconds)

return 'OK'
