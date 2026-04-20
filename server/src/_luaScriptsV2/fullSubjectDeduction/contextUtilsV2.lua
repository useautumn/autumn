-- ============================================================================
-- CONTEXT UTILITIES
-- Functions for managing in-memory SubjectBalance context during deductions
-- ============================================================================

local function mark_customer_entitlement_for_update(context, customer_entitlement_id)

  if is_nil(customer_entitlement_id) then
    return
  end

  if context.pending_write_ids[customer_entitlement_id] then
    return
  end

  context.pending_write_ids[customer_entitlement_id] = true
  table.insert(context.pending_writes, customer_entitlement_id)
end

local function init_context(params)
  local logs = {}
  local read_result = read_subject_balances({
    org_id = params.org_id,
    env = params.env,
    customer_id = params.customer_id,
    customer_entitlement_deductions = params.customer_entitlement_deductions,
  })

  local context = {
    customer_entitlements = {},
    rollovers = {},
    org_id = params.org_id,
    env = params.env,
    customer_id = params.customer_id,
    mutation_logs = {},
    pending_writes = {},
    pending_write_ids = {},
    missing_customer_entitlement_ids =
      read_result.missing_customer_entitlement_ids or {},
    logs = logs,
    logger = {
      log = function(fmt, ...)
        table.insert(logs, string.format(fmt, ...))
      end,
    },
  }

  for _, ent_obj in ipairs(params.customer_entitlement_deductions or {}) do
    local ent_id = ent_obj.customer_entitlement_id
    local balance_entry = read_result.balances_by_id[ent_id]

    if balance_entry then
      local subject_balance = balance_entry.subject_balance
      local has_entity_scope = not is_nil(ent_obj.entity_feature_id)
      local entities = nil

      if has_entity_scope then
        entities = safe_table(subject_balance.entities)
        subject_balance.entities = entities
      end

      local ent_data = {
        base_path = ent_id,
        balance_key = balance_entry.balance_key,
        subject_balance = subject_balance,
        customer_entitlement_id = ent_id,
        feature_id = balance_entry.feature_id,
        has_entity_scope = has_entity_scope,
        adjustment = safe_number(subject_balance.adjustment),
        unlimited = subject_balance.unlimited,
        is_loose = is_nil(subject_balance.customer_product_id),
        balance = has_entity_scope and 0 or safe_number(subject_balance.balance),
        entities = has_entity_scope and entities or nil,
      }

      context.customer_entitlements[ent_id] = ent_data

      for _, rollover in ipairs(subject_balance.rollovers or {}) do
        if rollover and rollover.id then
          local rollover_entities = safe_table(rollover.entities)
          rollover.entities = rollover_entities

          context.rollovers[rollover.id] = {
            base_path = rollover.id,
            cus_ent_id = ent_id,
            rollover_ref = rollover,
            balance = safe_number(rollover.balance),
            usage = safe_number(rollover.usage),
            entities = rollover_entities,
          }
        end
      end
    end
  end

  return context
end

local function append_mutation_log(params)
  local context = params.context
  table.insert(context.mutation_logs, {
    target_type = params.target_type,
    customer_entitlement_id = params.customer_entitlement_id or cjson.null,
    rollover_id = params.rollover_id or cjson.null,
    entity_id = params.entity_id or cjson.null,
    credit_cost = params.credit_cost or 1,
    balance_delta = params.balance_delta or 0,
    adjustment_delta = params.adjustment_delta or 0,
    usage_delta = params.usage_delta or 0,
    value_delta = params.value_delta or 0,
  })
end

local function update_in_memory_customer_entitlement_mutation(params)
  local target = params.target
  local entity_id = params.entity_id
  local balance_delta = params.balance_delta
  local adjustment_delta = params.adjustment_delta

  if balance_delta == nil then
    balance_delta = params.delta or 0
  end

  if adjustment_delta == nil then
    adjustment_delta = params.alter_granted_balance and balance_delta or 0
  end

  if entity_id then
    if not target[entity_id] then
      target[entity_id] = { balance = 0, adjustment = 0 }
    end

    target[entity_id].balance =
      (target[entity_id].balance or 0) + balance_delta
    target[entity_id].adjustment =
      (target[entity_id].adjustment or 0) + adjustment_delta
    return
  end

  target.balance = (target.balance or 0) + balance_delta
  target.adjustment = (target.adjustment or 0) + adjustment_delta

  if target.subject_balance then
    target.subject_balance.balance = target.balance
    target.subject_balance.adjustment = target.adjustment
  end
end

local function update_in_memory_rollover_mutation(params)
  local target = params.target
  local entity_id = params.entity_id
  local balance_delta = params.balance_delta or 0
  local usage_delta = params.usage_delta or 0

  if entity_id then
    if not target[entity_id] then
      target[entity_id] = { balance = 0, usage = 0 }
    end

    target[entity_id].balance = (target[entity_id].balance or 0) + balance_delta
    target[entity_id].usage = (target[entity_id].usage or 0) + usage_delta
    return
  end

  target.balance = (target.balance or 0) + balance_delta
  target.usage = (target.usage or 0) + usage_delta

  if target.rollover_ref then
    target.rollover_ref.balance = target.balance
    target.rollover_ref.usage = target.usage
  end
end

local function queue_customer_entitlement_mutation(params)
  local context = params.context
  local balance_delta = params.balance_delta
  local adjustment_delta = params.adjustment_delta

  if balance_delta == nil then
    balance_delta = params.delta or 0
  end

  if adjustment_delta == nil then
    adjustment_delta = params.alter_granted_balance and balance_delta or 0
  end

  if balance_delta == 0 and adjustment_delta == 0 then
    return
  end

  mark_customer_entitlement_for_update(
    context,
    params.customer_entitlement_id
  )

  append_mutation_log({
    context = context,
    target_type = 'customer_entitlement',
    customer_entitlement_id = params.customer_entitlement_id,
    rollover_id = nil,
    entity_id = params.entity_id,
    credit_cost = params.credit_cost or 1,
    balance_delta = balance_delta,
    adjustment_delta = adjustment_delta,
    usage_delta = 0,
    value_delta = params.value_delta or 0,
  })
end

local function queue_rollover_mutation(params)
  local context = params.context
  local balance_delta = params.balance_delta or 0
  local usage_delta = params.usage_delta or 0
  local rollover_id = params.rollover_id

  if balance_delta == 0 and usage_delta == 0 then
    return
  end

  local rollover_data = context.rollovers[rollover_id]

  mark_customer_entitlement_for_update(
    context,
    rollover_data and rollover_data.cus_ent_id or nil
  )

  append_mutation_log({
    context = context,
    target_type = 'rollover',
    customer_entitlement_id = rollover_data and rollover_data.cus_ent_id or nil,
    rollover_id = rollover_id,
    entity_id = params.entity_id,
    credit_cost = params.credit_cost or 1,
    balance_delta = balance_delta,
    adjustment_delta = 0,
    usage_delta = usage_delta,
    value_delta = params.value_delta or 0,
  })
end

local function queue_rollover_update(params)
  local deduct_amount = params.deduct_amount

  queue_rollover_mutation({
    context = params.context,
    rollover_id = params.rollover_id,
    entity_id = params.entity_id,
    credit_cost = params.credit_cost,
    balance_delta = -deduct_amount,
    usage_delta = deduct_amount,
    value_delta = params.value_delta or 0,
  })
end

local function collect_modified_customer_entitlement_ids(params)
  local context = params.context
  local extra_customer_entitlement_ids =
    safe_table(params.extra_customer_entitlement_ids)
  local modified_customer_entitlement_ids = {}
  local seen_modified_customer_entitlement_ids = {}

  for _, customer_entitlement_id in ipairs(context.pending_writes or {}) do
    if not is_nil(customer_entitlement_id)
        and not seen_modified_customer_entitlement_ids[customer_entitlement_id]
    then
      seen_modified_customer_entitlement_ids[customer_entitlement_id] = true
      table.insert(
        modified_customer_entitlement_ids,
        customer_entitlement_id
      )
    end
  end

  for _, customer_entitlement_id in ipairs(extra_customer_entitlement_ids) do
    if not is_nil(customer_entitlement_id)
        and not seen_modified_customer_entitlement_ids[customer_entitlement_id]
    then
      seen_modified_customer_entitlement_ids[customer_entitlement_id] = true
      table.insert(
        modified_customer_entitlement_ids,
        customer_entitlement_id
      )
    end
  end

  return modified_customer_entitlement_ids
end

local function update_in_memory_rollover(params)
  update_in_memory_rollover_mutation({
    target = params.target,
    entity_id = params.entity_id,
    balance_delta = -(params.deduct_amount or 0),
    usage_delta = params.deduct_amount or 0,
  })
end

local function apply_pending_writes(_, context)
  local writes_by_balance_key = {}

  for _, customer_entitlement_id in ipairs(context.pending_writes) do
    local ent_data = context.customer_entitlements[customer_entitlement_id]

    if ent_data and ent_data.balance_key and ent_data.subject_balance then
      if writes_by_balance_key[ent_data.balance_key] == nil then
        writes_by_balance_key[ent_data.balance_key] = {}
      end

      table.insert(
        writes_by_balance_key[ent_data.balance_key],
        customer_entitlement_id
      )
      table.insert(
        writes_by_balance_key[ent_data.balance_key],
        cjson.encode(ent_data.subject_balance)
      )
    end
  end

  for balance_key, write_args in pairs(writes_by_balance_key) do
    if #write_args > 0 then
      local redis_args = { 'HSET', balance_key }
      for _, arg in ipairs(write_args) do
        table.insert(redis_args, arg)
      end
      redis.call(unpack(redis_args))
    end
  end
end
