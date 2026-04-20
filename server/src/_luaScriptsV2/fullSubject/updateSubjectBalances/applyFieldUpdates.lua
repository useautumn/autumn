-- ============================================================================
-- APPLY FIELD UPDATES
-- Per-field helpers that apply updates to a SubjectBalance in place.
-- Entity-level updates append mutation logs for aggregation propagation.
-- ============================================================================

local function apply_balance_and_adjustment_update(params)
  local subject_balance = params.subject_balance
  local update = params.update
  local context = params.context
  local cus_ent_id = params.cus_ent_id

  local old_balance = safe_number(subject_balance.balance)
  local old_adjustment = safe_number(subject_balance.adjustment)

  if not is_absent(update.balance) then
    subject_balance.balance = update.balance
  end
  if not is_absent(update.additional_balance) then
    subject_balance.additional_balance = update.additional_balance
  end
  if not is_absent(update.adjustment) then
    subject_balance.adjustment = update.adjustment
  end

  if subject_balance.isEntityLevel then
    local bal_delta = safe_number(subject_balance.balance) - old_balance
    local adj_delta = safe_number(subject_balance.adjustment) - old_adjustment

    if bal_delta ~= 0 or adj_delta ~= 0 then
      local entity_id = subject_balance.internal_entity_id
      if is_absent(entity_id) then entity_id = cjson.null end

      table.insert(context.mutation_logs, {
        target_type = 'customer_entitlement',
        customer_entitlement_id = cus_ent_id,
        entity_id = entity_id,
        balance_delta = bal_delta,
        adjustment_delta = adj_delta,
      })
    end
  end
end

local function apply_entities_update(params)
  local subject_balance = params.subject_balance
  local update = params.update
  local context = params.context
  local cus_ent_id = params.cus_ent_id

  if is_absent(update.entities) then return end

  if not subject_balance.isEntityLevel then
    subject_balance.entities = update.entities
    return
  end

  local old_entities = safe_table(subject_balance.entities)

  subject_balance.entities = update.entities

  local new_entities = safe_table(subject_balance.entities)

  local all_entity_ids = {}
  for eid, _ in pairs(old_entities) do all_entity_ids[eid] = true end
  for eid, _ in pairs(new_entities) do all_entity_ids[eid] = true end

  for eid, _ in pairs(all_entity_ids) do
    local old_bal = old_entities[eid] and safe_number(old_entities[eid].balance) or 0
    local old_adj = old_entities[eid] and safe_number(old_entities[eid].adjustment) or 0
    local new_bal = new_entities[eid] and safe_number(new_entities[eid].balance) or 0
    local new_adj = new_entities[eid] and safe_number(new_entities[eid].adjustment) or 0

    local bal_delta = new_bal - old_bal
    local adj_delta = new_adj - old_adj

    if bal_delta ~= 0 or adj_delta ~= 0 then
      table.insert(context.mutation_logs, {
        target_type = 'customer_entitlement',
        customer_entitlement_id = cus_ent_id,
        entity_id = eid,
        balance_delta = bal_delta,
        adjustment_delta = adj_delta,
      })
    end
  end
end

local function apply_next_reset_at_update(params)
  local subject_balance = params.subject_balance
  local update = params.update

  if not is_absent(update.next_reset_at) then
    subject_balance.next_reset_at = update.next_reset_at
  end
end

--[[
  Emits rollover mutation logs for one rollover row with a signed multiplier.
    sign = +1 for insert, -1 for delete. Overwrites = delete(old) + insert(new).
  Per-entity rollovers emit one log per entity; top-level rollovers fall back
  to subject_balance.internal_entity_id. Gated on subject_balance.isEntityLevel.
]]
local function emit_rollover_logs(context, sb, cus_ent_id, rollover, sign)
  if not sb.isEntityLevel or type(rollover) ~= 'table' then return end

  local function push(entity_id, bal, use)
    local bd = sign * safe_number(bal)
    local ud = sign * safe_number(use)
    if bd == 0 and ud == 0 then return end
    table.insert(context.mutation_logs, {
      target_type = 'rollover',
      customer_entitlement_id = cus_ent_id,
      entity_id = is_absent(entity_id) and cjson.null or entity_id,
      balance_delta = bd,
      usage_delta = ud,
    })
  end

  local entities = safe_table(rollover.entities)
  if next(entities) == nil then
    push(sb.internal_entity_id, rollover.balance, rollover.usage)
    return
  end

  for eid, entry in pairs(entities) do
    if type(entry) == 'table' then push(eid, entry.balance, entry.usage) end
  end
end

local function apply_rollover_updates(params)
  local subject_balance = params.subject_balance
  local update = params.update
  local context = params.context
  local cus_ent_id = params.cus_ent_id

  subject_balance.rollovers = safe_table(subject_balance.rollovers)

  if not is_absent(update.rollover_insert) then
    emit_rollover_logs(context, subject_balance, cus_ent_id, update.rollover_insert, 1)
    table.insert(subject_balance.rollovers, update.rollover_insert)
  end

  if not is_absent(update.rollover_overwrites) then
    local overwrite_map = {}
    for _, ow in ipairs(update.rollover_overwrites) do
      overwrite_map[ow.id] = ow
    end

    for i, rollover in ipairs(subject_balance.rollovers) do
      local ow = overwrite_map[rollover.id]
      if ow then
        -- Overwrite = delete(old) + insert(new). If ow.entities is absent,
        -- the new row keeps the existing entities map (matches apply semantics).
        emit_rollover_logs(context, subject_balance, cus_ent_id, rollover, -1)
        emit_rollover_logs(context, subject_balance, cus_ent_id, {
          balance = ow.balance,
          usage = ow.usage,
          entities = is_absent(ow.entities) and rollover.entities or ow.entities,
        }, 1)

        subject_balance.rollovers[i].balance = ow.balance
        subject_balance.rollovers[i].usage = ow.usage
        if not is_absent(ow.entities) then
          subject_balance.rollovers[i].entities = ow.entities
        end
      end
    end
  end

  if not is_absent(update.rollover_delete_ids) then
    local delete_set = {}
    for _, del_id in ipairs(update.rollover_delete_ids) do
      delete_set[del_id] = true
    end

    local new_rollovers = {}
    for _, rollover in ipairs(subject_balance.rollovers) do
      if delete_set[rollover.id] then
        emit_rollover_logs(context, subject_balance, cus_ent_id, rollover, -1)
      else
        table.insert(new_rollovers, rollover)
      end
    end
    subject_balance.rollovers = new_rollovers
  end
end

local function apply_replaceable_updates(params)
  local subject_balance = params.subject_balance
  local update = params.update

  if not is_absent(update.new_replaceables) then
    subject_balance.replaceables = safe_table(subject_balance.replaceables)
    for _, replaceable in ipairs(update.new_replaceables) do
      table.insert(subject_balance.replaceables, replaceable)
    end
  end

  if not is_absent(update.deleted_replaceable_ids) then
    if not is_absent(subject_balance.replaceables) then
      local delete_set = {}
      for _, del_id in ipairs(update.deleted_replaceable_ids) do
        delete_set[del_id] = true
      end

      local new_replaceables = {}
      for _, replaceable in ipairs(subject_balance.replaceables) do
        if not delete_set[replaceable.id] then
          table.insert(new_replaceables, replaceable)
        end
      end
      subject_balance.replaceables = new_replaceables
    end
  end
end
