-- Atomically replace one cached subject view while preserving unrelated hash fields.
local params = cjson.decode(ARGV[1])
local subject_key = KEYS[1]
local epoch_key = KEYS[2]
local runtime_subject_key = KEYS[3]
local receipt_key = KEYS[4]

local function number_or_zero(value)
  if value == nil or value == cjson.null then
    return 0
  end
  return tonumber(value)
end

local function round_balance(value)
  local factor = 10000000000
  if value >= 0 then
    return math.floor(value * factor + 0.5) / factor
  end
  return math.ceil(value * factor - 0.5) / factor
end

local function has_unsupported_runtime_state(balance)
  local has_entities = type(balance.entities) == 'table'
    and next(balance.entities) ~= nil
  local has_rollovers = type(balance.rollovers) == 'table'
    and next(balance.rollovers) ~= nil
  local has_replaceables = type(balance.replaceables) == 'table'
    and next(balance.replaceables) ~= nil
  local has_entity_feature = type(balance.entitlement) == 'table'
    and balance.entitlement.entity_feature_id ~= nil
    and balance.entitlement.entity_feature_id ~= cjson.null

  return number_or_zero(balance.additional_balance) ~= 0
    or balance.is_pooled_balance == true
    or (balance.pooled_balance_id ~= nil
      and balance.pooled_balance_id ~= cjson.null)
    or (balance.pooled_contribution_id ~= nil
      and balance.pooled_contribution_id ~= cjson.null)
    or (balance.internal_entity_id ~= nil
      and balance.internal_entity_id ~= cjson.null)
    or has_entity_feature
    or has_entities
    or has_rollovers
    or has_replaceables
end

local existing_receipt = redis.call('GET', receipt_key)
if existing_receipt then
  return existing_receipt
end

if redis.call('EXISTS', subject_key) == 0 then
  return 'CACHE_MISSING'
end

local published_target_fields = {}

-- Resolve every live source and adjust each draft target before changing Redis.
-- Returning early here leaves A and the existing subject view untouched.
for index, balance_hash in ipairs(params.balance_hashes) do
  local balance_key = KEYS[index + 4]

  for _, transition in ipairs(balance_hash.balance_transitions or {}) do
    local source_json = redis.call('HGET', balance_key, transition.source_field)
    local draft_target_json = balance_hash.writes[transition.target_field]
    if not source_json or not draft_target_json then
      return 'CACHE_MISSING'
    end

    local source = cjson.decode(source_json)
    local live_target_json = redis.call(
      'HGET', balance_key, transition.target_field
    )
    if live_target_json then
      return 'UNSUPPORTED:target_already_cached'
    end
    local target = cjson.decode(draft_target_json)
    local live_source_balance = tonumber(source.balance)
    local live_source_adjustment = number_or_zero(source.adjustment)
    local target_balance = tonumber(target.balance)
    local target_adjustment = number_or_zero(target.adjustment)
    if not live_source_balance
      or not live_source_adjustment
      or not target_balance
      or not target_adjustment
    then
      return 'CACHE_MISSING'
    end
    if has_unsupported_runtime_state(source)
      or has_unsupported_runtime_state(target)
    then
      return 'UNSUPPORTED:complex_runtime_state'
    end

    local additional_usage =
      (live_source_adjustment - transition.source_adjustment)
      - (live_source_balance - transition.source_balance)
    target.balance = round_balance(target_balance - additional_usage)
    local published_target_json = cjson.encode(target)
    balance_hash.writes[transition.target_field] = published_target_json
    published_target_fields[transition.target_field] = published_target_json
  end
end

local next_epoch = redis.call('INCR', epoch_key)
params.subject.subjectViewEpoch = next_epoch

for index, balance_hash in ipairs(params.balance_hashes) do
  local balance_key = KEYS[index + 4]

  for _, field_name in ipairs(balance_hash.deletes) do
    redis.call('HDEL', balance_key, field_name)
  end

  for field_name, field_value in pairs(balance_hash.writes) do
    local replace = false
    for _, transition in ipairs(balance_hash.balance_transitions or {}) do
      if transition.target_field == field_name then
        replace = true
        break
      end
    end
    if replace then
      redis.call('HSET', balance_key, field_name, field_value)
    else
      redis.call('HSETNX', balance_key, field_name, field_value)
    end
  end

  if redis.call('EXISTS', balance_key) == 1 then
    redis.call('EXPIRE', balance_key, params.ttl_seconds)
  end
end

redis.call('SET', subject_key, cjson.encode(params.subject), 'EX', params.ttl_seconds)
redis.call('UNLINK', runtime_subject_key)
redis.call('EXPIRE', epoch_key, params.epoch_ttl_seconds)

local result = cjson.encode({
  status = 'OK',
  target_fields = published_target_fields,
})
redis.call('SET', receipt_key, result, 'EX', params.ttl_seconds)

return result
