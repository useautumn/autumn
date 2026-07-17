-- Atomically applies guarded SubjectBalance updates across multiple feature hashes.
-- KEYS[1] is the view epoch key; KEYS[2..N] align with params.batches.

local epoch_key = KEYS[1]
local params = cjson.decode(ARGV[1])
local batches = safe_table(params.batches)
local ttl_seconds = params.ttl_seconds
local expected_epoch = params.expected_subject_view_epoch
local BALANCE_EPOCH_FIELD = '_subject_view_epoch'

local function conflict_result(fields)
  fields.applied = {}
  fields.skipped = {}
  fields.conflict = true
  return cjson.encode(fields)
end

if is_absent(expected_epoch) or #batches ~= #KEYS - 1 then
  return conflict_result({ invalid = { 'batch_configuration' } })
end

local expected_epoch_string = tostring(expected_epoch)
local current_epoch = redis.call('GET', epoch_key)

if current_epoch == false then
  return conflict_result({ cache_miss = true, missing_epoch_key = true })
end

if current_epoch ~= expected_epoch_string then
  return conflict_result({ epoch_mismatch = true })
end

local missing_hashes = {}
local missing_epoch_fields = {}
local mismatched_epoch_fields = {}

for batch_index, _ in ipairs(batches) do
  local balance_key = KEYS[batch_index + 1]
  if redis.call('EXISTS', balance_key) == 0 then
    table.insert(missing_hashes, batch_index)
  else
    local balance_epoch = redis.call('HGET', balance_key, BALANCE_EPOCH_FIELD)
    if balance_epoch == false then
      table.insert(missing_epoch_fields, batch_index)
    elseif balance_epoch ~= expected_epoch_string then
      table.insert(mismatched_epoch_fields, batch_index)
    end
  end
end

if #missing_hashes > 0 or #missing_epoch_fields > 0 then
  return conflict_result({
    cache_miss = true,
    missing_hashes = missing_hashes,
    missing_epoch_fields = missing_epoch_fields,
  })
end

if #mismatched_epoch_fields > 0 then
  return conflict_result({
    epoch_mismatch = true,
    mismatched_epoch_fields = mismatched_epoch_fields,
  })
end

local contexts = {}
local missing = {}
local mismatched = {}
local invalid = {}
local missing_set = {}
local mismatched_set = {}
local invalid_set = {}
local seen_customer_entitlement_ids = {}

local function append_unique(values, seen, value)
  if not seen[value] then
    table.insert(values, value)
    seen[value] = true
  end
end

for batch_index, batch in ipairs(batches) do
  local updates = safe_table(batch.updates)
  local context = init_update_context({
    balance_key = KEYS[batch_index + 1],
    updates = updates,
  })
  contexts[batch_index] = context

  for _, update in ipairs(updates) do
    local cus_ent_id = update.cus_ent_id
    local ent_data = context.customer_entitlements[cus_ent_id]

    if is_absent(cus_ent_id) then
      append_unique(invalid, invalid_set, 'missing_cus_ent_id')
    elseif seen_customer_entitlement_ids[cus_ent_id] then
      append_unique(invalid, invalid_set, cus_ent_id)
    elseif not ent_data then
      append_unique(missing, missing_set, cus_ent_id)
    elseif has_ambiguous_relative_update(update) then
      append_unique(invalid, invalid_set, cus_ent_id)
    elseif has_expected_value_mismatch(ent_data.subject_balance, update) then
      append_unique(mismatched, mismatched_set, cus_ent_id)
    end

    if not is_absent(cus_ent_id) then
      seen_customer_entitlement_ids[cus_ent_id] = true
    end
  end
end

if #missing > 0 or #mismatched > 0 or #invalid > 0 then
  return conflict_result({
    missing = missing,
    mismatched = mismatched,
    invalid = invalid,
  })
end

local applied = {}
local logs = {}

for batch_index, batch in ipairs(batches) do
  local context = contexts[batch_index]
  local balance_key = KEYS[batch_index + 1]

  for _, update in ipairs(safe_table(batch.updates)) do
    local cus_ent_id = update.cus_ent_id
    local subject_balance = context.customer_entitlements[cus_ent_id].subject_balance
    local helper_params = {
      subject_balance = subject_balance,
      update = update,
      context = context,
      cus_ent_id = cus_ent_id,
    }

    apply_balance_and_adjustment_update(helper_params)
    apply_entities_update(helper_params)
    apply_reset_cycle_anchor_update(helper_params)
    apply_next_reset_at_update(helper_params)
    apply_rollover_updates(helper_params)
    apply_replaceable_updates(helper_params)

    redis.call('HSET', balance_key, cus_ent_id, cjson.encode(subject_balance))
    applied[cus_ent_id] = true
  end

  update_aggregated_balances({
    context = context,
    mutation_logs = context.mutation_logs,
  })

  for _, log_entry in ipairs(context.logs) do
    table.insert(logs, log_entry)
  end

  if ttl_seconds and ttl_seconds > 0 then
    redis.call('EXPIRE', balance_key, ttl_seconds)
  end
end

return cjson.encode({ applied = applied, skipped = {}, logs = logs })
