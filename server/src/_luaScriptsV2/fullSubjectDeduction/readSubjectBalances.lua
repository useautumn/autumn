-- ============================================================================
-- READ SUBJECT BALANCES
-- Functions to read shared SubjectBalance payloads from Redis hashes
-- ============================================================================

local function build_shared_subject_balance_key(params)
  return '{'
      .. params.customer_id
      .. '}:'
      .. params.org_id
      .. ':'
      .. params.env
      .. ':full_subject:shared_balances:'
      .. params.feature_id
end

local function decode_subject_balance(raw_value)
  if is_nil(raw_value) then
    return nil
  end

  local decoded = cjson.decode(raw_value)
  if type(decoded) ~= 'table' then
    return nil
  end

  return decoded
end

local function read_subject_balances(params)
  local balances_by_id = {}
  local missing_customer_entitlement_ids = {}
  local entries_by_balance_key = {}

  for _, ent_obj in ipairs(params.customer_entitlement_deductions or {}) do
    local customer_entitlement_id = ent_obj.customer_entitlement_id
    local feature_id = ent_obj.feature_id

    if customer_entitlement_id and feature_id then
      local balance_key = build_shared_subject_balance_key({
        org_id = params.org_id,
        env = params.env,
        customer_id = params.customer_id,
        feature_id = feature_id,
      })

      if entries_by_balance_key[balance_key] == nil then
        entries_by_balance_key[balance_key] = {
          feature_id = feature_id,
          customer_entitlement_ids = {},
        }
      end

      table.insert(
        entries_by_balance_key[balance_key].customer_entitlement_ids,
        customer_entitlement_id
      )
    end
  end

  for balance_key, entry in pairs(entries_by_balance_key) do
    local hmget_args = { 'HMGET', balance_key }
    for _, customer_entitlement_id in ipairs(entry.customer_entitlement_ids) do
      table.insert(hmget_args, customer_entitlement_id)
    end

    local raw_values = redis.call(unpack(hmget_args))

    for index, customer_entitlement_id in ipairs(entry.customer_entitlement_ids) do
      local raw_value = raw_values[index]
      local subject_balance = decode_subject_balance(raw_value)

      if subject_balance == nil then
        table.insert(
          missing_customer_entitlement_ids,
          customer_entitlement_id
        )
      else
        balances_by_id[customer_entitlement_id] = {
          balance_key = balance_key,
          customer_entitlement_id = customer_entitlement_id,
          feature_id = entry.feature_id,
          subject_balance = subject_balance,
        }
      end
    end
  end

  return {
    balances_by_id = balances_by_id,
    missing_customer_entitlement_ids = missing_customer_entitlement_ids,
  }
end

local function read_rollover_data(rollover)
  if type(rollover) ~= 'table' then
    return nil
  end

  return {
    balance = safe_number(rollover.balance),
    usage = safe_number(rollover.usage),
    entities = safe_table(rollover.entities),
  }
end

local function read_current_balance(subject_balance)
  if type(subject_balance) ~= 'table' then
    return 0
  end

  return safe_number(subject_balance.balance)
end

local function read_current_entity_balance(subject_balance, entity_id)
  if type(subject_balance) ~= 'table' or is_nil(entity_id) then
    return nil
  end

  local entities = safe_table(subject_balance.entities)
  local entity_balance = entities[entity_id]

  if type(entity_balance) ~= 'table' then
    return nil
  end

  return {
    balance = safe_number(entity_balance.balance),
    adjustment = safe_number(entity_balance.adjustment),
  }
end

local function read_current_entities(subject_balance)
  if type(subject_balance) ~= 'table' then
    return {}
  end

  return safe_table(subject_balance.entities)
end
