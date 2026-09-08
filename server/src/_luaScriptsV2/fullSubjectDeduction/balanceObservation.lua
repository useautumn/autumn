local function observation_balance(params, context)
  local deductions = params.customer_entitlement_deductions or {}
  if #deductions ~= 1 then return nil end
  local deduction = deductions[1]
  local entry = context.customer_entitlements[deduction.customer_entitlement_id]
  if not entry or entry.has_entity_scope or entry.unlimited
      or safe_number(deduction.credit_cost or 1) ~= 1
      or #(entry.subject_balance.rollovers or {}) > 0
      or type(entry.subject_balance.balance) ~= 'number'
      or entry.subject_balance.balance < 0 or entry.balance < 0
      or safe_number(entry.subject_balance.additional_balance) ~= 0 then
    return nil
  end
  return {
    customerEntitlementId = entry.customer_entitlement_id,
    balance = entry.balance,
    adjustment = entry.adjustment,
    additionalBalance = 0,
    nextResetAt = entry.subject_balance.next_reset_at or cjson.null,
    expiresAt = entry.subject_balance.expires_at or cjson.null,
  }
end

local function begin_balance_observation(params, context)
  if is_nil(params.observation) then return nil end
  local capture = { config = params.observation }
  if type(capture.config) == 'table' and capture.config.kind == 'deduct' then
    local ok, before = pcall(observation_balance, params, context)
    capture.before = ok and before or nil
  end
  return capture
end

local function prepare_balance_observation(params, context, capture, decision)
  local config = capture.config
  local metadata_key = KEYS[config.metadata_key_index]
  if not metadata_key or metadata_key == '' then
    return { error = 'metadata_key_missing' }
  end
  local epoch_text = redis.call('GET', KEYS[4])
  local epoch = tonumber(epoch_text)
  if not epoch or epoch < 0 or epoch ~= math.floor(epoch) then
    return { error = 'epoch_missing' }
  end
  local ttl = redis.call('PTTL', KEYS[4]) - 1
  if ttl <= 0 then return { error = 'epoch_expiry_missing' } end

  local metadata_text = redis.call('GET', metadata_key)
  local metadata = nil
  if metadata_text then
    local decoded, value = pcall(cjson.decode, metadata_text)
    if not decoded or type(value) ~= 'table' or value.schemaVersion ~= 1
        or type(value.incarnation) ~= 'string' or type(value.sequence) ~= 'string'
        or not tonumber(value.sequence) or not tonumber(value.epoch) then
      return { error = 'metadata_invalid' }
    end
    metadata = value
  end
  if not metadata or metadata.epoch ~= epoch then
    metadata = { schemaVersion = 1, epoch = epoch, incarnation = config.incarnation, sequence = '0' }
  end
  local previous_sequence = tonumber(metadata.sequence)
  if previous_sequence < 0 or previous_sequence ~= math.floor(previous_sequence)
      or previous_sequence >= 9007199254740991 then
    return { error = 'sequence_exhausted' }
  end
  metadata.sequence = string.format('%.0f', previous_sequence + 1)

  local kind = config.kind
  local reason = config.reason or cjson.null
  local before = capture.before
  local after = nil
  if kind == 'deduct' then
    after = decision == 'rejected' and before or observation_balance(params, context)
    if not before or not after then
      kind = 'unsupported'
      reason = 'balance_shape_not_supported'
      before, after = nil, nil
    end
  end
  local observation = {
    schemaVersion = 1,
    source = 'redis',
    orgId = params.org_id,
    env = params.env,
    customerId = params.customer_id,
    featureId = params.feature_id,
    requestId = config.request_id,
    epoch = epoch,
    incarnation = metadata.incarnation,
    sequence = metadata.sequence,
    kind = kind,
    decision = decision,
    reason = reason,
    requestedValue = params.amount_to_deduct or cjson.null,
    targetBalance = params.target_balance or cjson.null,
    overageBehavior = params.overage_behaviour or 'cap',
    before = before or cjson.null,
    after = after or cjson.null,
  }
  local marker = cjson.encode(observation)
  -- Expiry follows the epoch's remaining lifetime, not a second sliding window.
  redis.call('SET', metadata_key, cjson.encode(metadata), 'PX', ttl)
  return { observation = observation, marker = marker }
end

local function capture_balance_observation(params, context, capture, decision)
  if not capture then return {} end
  -- Instrumentation failures must never turn a deduction into a retryable error.
  local ok, result = pcall(prepare_balance_observation, params, context, capture, decision)
  if not ok then return { error = 'capture_failed' } end
  return result
end

local function replay_balance_observation(params, idempotency_key)
  if is_nil(params.observation) then return {} end
  local read_ok, marker = pcall(redis.call, 'GET', idempotency_key)
  if not read_ok then return { error = 'receipt_unreadable' } end
  if marker == '1' then return { error = 'legacy_receipt' } end
  local decoded, observation = pcall(cjson.decode, marker or '')
  if not decoded or type(observation) ~= 'table' or observation.schemaVersion ~= 1
      or observation.source ~= 'redis' then
    return { error = 'receipt_invalid' }
  end
  return { observation = observation }
end
