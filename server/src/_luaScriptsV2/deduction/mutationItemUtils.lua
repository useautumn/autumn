-- ============================================================================
-- MUTATION ITEM HELPERS
-- Shared conversion helpers for turning deduction results into mutation items
-- ============================================================================

-- ============================================================================
-- HELPER: Append an item to a mutation item array
-- ============================================================================
local function append_mutation_item(items, item)
  table.insert(items, item)
end

-- ============================================================================
-- HELPER: Convert one DeductionUpdate into mutation items
-- Returns an array of mutation items for top-level and entity-scoped deltas.
-- ============================================================================
local function deduction_update_to_mutation_items(customer_entitlement_id, update)
  local items = {}
  local balance_delta = safe_number(update.balance_delta)
  local adjustment_delta = safe_number(update.adjustment_delta)

  if balance_delta ~= 0 or adjustment_delta ~= 0 then
    append_mutation_item(items, {
      target_type = 'customer_entitlement',
      customer_entitlement_id = customer_entitlement_id,
      rollover_id = cjson.null,
      entity_id = cjson.null,
      balance_delta = balance_delta,
      adjustment_delta = adjustment_delta,
      usage_delta = 0,
    })
  end

  local entity_deltas = safe_table(update.entity_deltas)
  for entity_id, entity_delta in pairs(entity_deltas) do
    local entity_balance_delta = safe_number(entity_delta.balance_delta)
    local entity_adjustment_delta = safe_number(entity_delta.adjustment_delta)

    if entity_balance_delta ~= 0 or entity_adjustment_delta ~= 0 then
      append_mutation_item(items, {
        target_type = 'customer_entitlement',
        customer_entitlement_id = customer_entitlement_id,
        rollover_id = cjson.null,
        entity_id = entity_id,
        balance_delta = entity_balance_delta,
        adjustment_delta = entity_adjustment_delta,
        usage_delta = 0,
      })
    end
  end

  return items
end

-- ============================================================================
-- HELPER: Convert one RolloverUpdate into mutation items
-- Returns an array of mutation items for top-level and entity-scoped deltas.
-- ============================================================================
local function rollover_update_to_mutation_items(rollover_id, rollover_update)
  local items = {}
  local balance_delta = safe_number(rollover_update.balance_delta)
  local usage_delta = safe_number(rollover_update.usage_delta)

  if balance_delta ~= 0 or usage_delta ~= 0 then
    append_mutation_item(items, {
      target_type = 'rollover',
      customer_entitlement_id = rollover_update.cus_ent_id or cjson.null,
      rollover_id = rollover_id,
      entity_id = cjson.null,
      balance_delta = balance_delta,
      adjustment_delta = 0,
      usage_delta = usage_delta,
    })
  end

  local entity_deltas = safe_table(rollover_update.entity_deltas)
  for entity_id, entity_delta in pairs(entity_deltas) do
    local entity_balance_delta = safe_number(entity_delta.balance_delta)
    local entity_usage_delta = safe_number(entity_delta.usage_delta)

    if entity_balance_delta ~= 0 or entity_usage_delta ~= 0 then
      append_mutation_item(items, {
        target_type = 'rollover',
        customer_entitlement_id = rollover_update.cus_ent_id or cjson.null,
        rollover_id = rollover_id,
        entity_id = entity_id,
        balance_delta = entity_balance_delta,
        adjustment_delta = 0,
        usage_delta = entity_usage_delta,
      })
    end
  end

  return items
end

-- ============================================================================
-- HELPER: Convert deduction result objects into one flat mutation item array
--
-- params:
--   updates: table | nil
--   rollover_updates: table | nil
-- ============================================================================
local function deduction_results_to_mutation_items(params)
  local items = {}
  local updates = params.updates or {}
  local rollover_updates = params.rollover_updates or {}

  for customer_entitlement_id, update in pairs(updates) do
    local update_items = deduction_update_to_mutation_items(customer_entitlement_id, update)
    for _, item in ipairs(update_items) do
      append_mutation_item(items, item)
    end
  end

  for rollover_id, rollover_update in pairs(rollover_updates) do
    local rollover_items = rollover_update_to_mutation_items(rollover_id, rollover_update)
    for _, item in ipairs(rollover_items) do
      append_mutation_item(items, item)
    end
  end

  return items
end
