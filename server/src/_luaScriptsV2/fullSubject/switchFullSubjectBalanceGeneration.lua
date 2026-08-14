-- Atomically replace only the balance fields owned by one subject manifest.
-- KEYS: subject, epoch, generation, handoff lock, then touched balance hashes.
local params = cjson.decode(ARGV[1])
local subject_key = KEYS[1]
local subject_view_epoch_key = KEYS[2]
local generation_key = KEYS[3]
local handoff_lock_key = KEYS[4]

local ttl_seconds = tonumber(params.ttl_seconds)
local epoch_ttl_seconds = tonumber(params.epoch_ttl_seconds)
local expected_generation_number = tonumber(params.expected_generation)

local function is_non_negative_integer_string(value)
  return type(value) == 'string'
    and (value == '0' or string.match(value, '^[1-9][0-9]*$') ~= nil)
end

if type(params.expected_subject_json) ~= 'string'
  or type(params.next_subject_json) ~= 'string'
  or type(params.expected_subject_view_epoch_exists) ~= 'boolean'
  or not is_non_negative_integer_string(params.expected_generation)
  or type(params.lock_token) ~= 'string'
  or params.lock_token == ''
  or ttl_seconds == nil
  or ttl_seconds <= 0
  or ttl_seconds ~= math.floor(ttl_seconds)
  or epoch_ttl_seconds == nil
  or epoch_ttl_seconds <= 0
  or epoch_ttl_seconds ~= math.floor(epoch_ttl_seconds) then
  return 'CONFLICT'
end

local expected_subject_view_epoch_number = 0
if params.expected_subject_view_epoch_exists then
  if not is_non_negative_integer_string(params.expected_subject_view_epoch) then
    return 'CONFLICT'
  end
  expected_subject_view_epoch_number = tonumber(params.expected_subject_view_epoch)
elseif params.expected_subject_view_epoch ~= '' then
  return 'CONFLICT'
end

local next_subject_view_epoch = expected_subject_view_epoch_number + 1
local next_generation_number = expected_generation_number + 1
local target_subject_ok, target_subject = pcall(cjson.decode, params.next_subject_json)
if not target_subject_ok
  or type(target_subject) ~= 'table'
  or type(target_subject.customer) ~= 'table'
  or tonumber(target_subject.subjectViewEpoch) ~= next_subject_view_epoch
  or tonumber(target_subject.balanceGeneration) ~= next_generation_number then
  return 'CONFLICT'
end

local balance_hashes = params.balance_hashes or {}
if type(balance_hashes) ~= 'table' or #balance_hashes ~= #KEYS - 4 then
  return 'CONFLICT'
end

for _, balance_hash in ipairs(balance_hashes) do
  if type(balance_hash.expected_fields) ~= 'table'
    or type(balance_hash.deletes) ~= 'table'
    or type(balance_hash.writes) ~= 'table' then
    return 'CONFLICT'
  end

  local expected_names = {}
  for _, expected_field in ipairs(balance_hash.expected_fields) do
    if type(expected_field) ~= 'table'
      or type(expected_field.name) ~= 'string'
      or type(expected_field.exists) ~= 'boolean'
      or type(expected_field.value) ~= 'string' then
      return 'CONFLICT'
    end
    expected_names[expected_field.name] = true
  end
  for _, field_name in ipairs(balance_hash.deletes) do
    if type(field_name) ~= 'string' or expected_names[field_name] ~= true then
      return 'CONFLICT'
    end
  end
  for field_name, field_value in pairs(balance_hash.writes) do
    if type(field_name) ~= 'string'
      or type(field_value) ~= 'string'
      or expected_names[field_name] ~= true then
      return 'CONFLICT'
    end
  end
end

local current_subject_json = redis.call('GET', subject_key)
if current_subject_json == false then
  return 'CACHE_MISSING'
end
if current_subject_json ~= params.expected_subject_json then
  return 'CONFLICT'
end

local current_subject_view_epoch = redis.call('GET', subject_view_epoch_key)
if params.expected_subject_view_epoch_exists then
  if current_subject_view_epoch == false
    or current_subject_view_epoch ~= params.expected_subject_view_epoch then
    return 'CONFLICT'
  end
elseif current_subject_view_epoch ~= false then
  return 'CONFLICT'
end

local current_generation = redis.call('GET', generation_key)
if current_generation == false then
  return 'CACHE_MISSING'
end
if current_generation ~= params.expected_generation then
  return 'CONFLICT'
end

local raw_handoff_lock = redis.call('GET', handoff_lock_key)
local lock_ok, handoff_lock = pcall(cjson.decode, raw_handoff_lock or '')
if not lock_ok
  or type(handoff_lock) ~= 'table'
  or handoff_lock.owner ~= 'attach'
  or handoff_lock.token ~= params.lock_token then
  return 'CONFLICT'
end

for index, balance_hash in ipairs(balance_hashes) do
  local balance_key = KEYS[index + 4]
  for _, expected_field in ipairs(balance_hash.expected_fields) do
    local current_value = redis.call('HGET', balance_key, expected_field.name)
    if expected_field.exists then
      if current_value == false or current_value ~= expected_field.value then
        return 'CONFLICT'
      end
    elseif current_value ~= false then
      return 'CONFLICT'
    end
  end
end

redis.call('INCR', subject_view_epoch_key)
redis.call('EXPIRE', subject_view_epoch_key, epoch_ttl_seconds)

for index, balance_hash in ipairs(balance_hashes) do
  local balance_key = KEYS[index + 4]
  for _, field_name in ipairs(balance_hash.deletes) do
    redis.call('HDEL', balance_key, field_name)
  end
  for field_name, field_value in pairs(balance_hash.writes) do
    redis.call('HSET', balance_key, field_name, field_value)
  end
  if redis.call('EXISTS', balance_key) == 1 then
    redis.call('EXPIRE', balance_key, ttl_seconds)
  end
end

redis.call('SET', subject_key, params.next_subject_json, 'EX', ttl_seconds)
redis.call('INCR', generation_key)
redis.call('DEL', handoff_lock_key)

return 'OK'
