-- ============================================================================
-- LOCK UNWIND HELPERS
-- Step-by-step helpers for reconciling a lock receipt to a final value
-- ============================================================================

-- ============================================================================
-- HELPER: Normalize a receipt identifier field to nil
-- ============================================================================
local function normalize_lock_item_id(value)
  if is_nil(value) then
    return nil
  end

  return value
end

-- ============================================================================
-- HELPER: Normalize delta signs for one mutation item
-- ============================================================================
local function get_lock_item_delta_signs(params)
  local item = params.item or {}

  return {
    value_sign = safe_number(item.value_delta) >= 0 and 1 or -1,
    balance_sign = safe_number(item.balance_delta) >= 0 and 1 or -1,
    adjustment_sign = safe_number(item.adjustment_delta) >= 0 and 1 or -1,
    usage_sign = safe_number(item.usage_delta) >= 0 and 1 or -1,
  }
end

-- ============================================================================
-- HELPER: Calculate how much of one item should be unwound in this iteration
-- ============================================================================
local function calculate_unwind_iteration_value(params)
  local item = params.item or {}
  local remaining_unwind_value = safe_number(params.remaining_unwind_value)
  local item_value_magnitude = math.abs(safe_number(item.value_delta))

  return math.min(item_value_magnitude, remaining_unwind_value)
end

-- ============================================================================
-- STEP 1: Calculate the current signed lock value from receipt items
-- ============================================================================
local function calculate_lock_value(params)
  local items = safe_table(params.items)
  local lock_value = 0

  for _, item in ipairs(items) do
    lock_value = lock_value + safe_number(item.value_delta)
  end

  return lock_value
end

-- ============================================================================
-- STEP 2: Calculate how much value should be unwound from the current lock
-- ============================================================================
local function calculate_unwind_value(params)
  local lock_value = safe_number(params.lock_value)
  local final_value = safe_number(params.final_value)
  local lock_magnitude = math.abs(lock_value)
  local final_magnitude = math.abs(final_value)

  if lock_value == 0 then
    return {
      unwind_value = 0,
    }
  end

  if final_value == 0 then
    return {
      unwind_value = lock_magnitude,
    }
  end

  local lock_sign = lock_value > 0 and 1 or -1
  local final_sign = final_value > 0 and 1 or -1

  if lock_sign ~= final_sign then
    return {
      unwind_value = lock_magnitude,
    }
  end

  if final_magnitude >= lock_magnitude then
    return {
      unwind_value = 0,
    }
  end

  return {
    unwind_value = lock_magnitude - final_magnitude,
  }
end



-- ============================================================================
-- STEP 3: Unwind one lock receipt item iteration
--
-- params:
--   context: table
--   item: mutation log item
--   remaining_unwind_value: positive magnitude
--
-- Returns:
--   {
--     applied = boolean,
--     unwind_iteration_value = number,
--     remaining_unwind_value = number,
--     error = string | nil,
--   }
-- ============================================================================
local function unwind_lock_item_iteration(params)
  local context = params.context
  local item = params.item or {}
  local remaining_unwind_value = safe_number(params.remaining_unwind_value)

  if remaining_unwind_value <= 0 then
    return {
      applied = false,
      unwind_iteration_value = 0,
      remaining_unwind_value = 0,
      error = nil,
    }
  end

  local unwind_iteration_value = calculate_unwind_iteration_value({
    item = item,
    remaining_unwind_value = remaining_unwind_value,
  })

  if unwind_iteration_value <= 0 then
    return {
      applied = false,
      unwind_iteration_value = 0,
      remaining_unwind_value = remaining_unwind_value,
      error = nil,
    }
  end

  local signs = get_lock_item_delta_signs({
    item = item,
  })

  -- Calculate the amount of credits to unwind
  local credits_to_unwind =
    unwind_iteration_value * safe_number(item.credit_cost or 1)
  local inverse_balance_delta = -signs.balance_sign * credits_to_unwind
  local inverse_adjustment_delta = safe_number(item.adjustment_delta) ~= 0
      and (-signs.adjustment_sign * credits_to_unwind)
    or 0 --[[ default to 0 if adjustment_delta is not set ]]
  local inverse_usage_delta = safe_number(item.usage_delta) ~= 0
      and (-signs.usage_sign * credits_to_unwind)
    or 0 --[[ default to 0 if usage_delta is not set ]]
  local inverse_value_delta = -signs.value_sign * unwind_iteration_value
  local entity_id = normalize_lock_item_id(item.entity_id)

  if item.target_type == 'customer_entitlement' then
    local customer_entitlement_id =
      normalize_lock_item_id(item.customer_entitlement_id)
    local ent_data = context.customer_entitlements[customer_entitlement_id]
    if not ent_data then
      return {
        applied = false,
        unwind_iteration_value = 0,
        remaining_unwind_value = remaining_unwind_value,
        error = 'LOCK_CUSTOMER_ENTITLEMENT_NOT_FOUND',
      }
    end

    local path = ent_data.base_path
    if entity_id then
      path = build_entity_path(path, entity_id)
    end

    queue_customer_entitlement_mutation({
      context = context,
      path = path,
      customer_entitlement_id = customer_entitlement_id,
      entity_id = entity_id,
      credit_cost = safe_number(item.credit_cost or 1),
      balance_delta = inverse_balance_delta,
      adjustment_delta = inverse_adjustment_delta,
      value_delta = inverse_value_delta,
    })

    update_in_memory_customer_entitlement_mutation({
      target = entity_id and ent_data.entities or ent_data,
      entity_id = entity_id,
      balance_delta = inverse_balance_delta,
      adjustment_delta = inverse_adjustment_delta,
    })

    return {
      applied = true,
      unwind_iteration_value = unwind_iteration_value,
      remaining_unwind_value = remaining_unwind_value - unwind_iteration_value,
      error = nil,
    }
  end

  if item.target_type == 'rollover' then
    local rollover_id = normalize_lock_item_id(item.rollover_id)
    local rollover_data = context.rollovers[rollover_id]
    if not rollover_data then
      return {
        applied = false,
        unwind_iteration_value = 0,
        remaining_unwind_value = remaining_unwind_value,
        error = 'LOCK_ROLLOVER_NOT_FOUND',
      }
    end

    local path = rollover_data.base_path
    if entity_id then
      path = build_entity_path(path, entity_id)
    end

    queue_rollover_mutation({
      context = context,
      path = path,
      rollover_id = rollover_id,
      entity_id = entity_id,
      credit_cost = safe_number(item.credit_cost or 1),
      balance_delta = inverse_balance_delta,
      usage_delta = inverse_usage_delta,
      value_delta = inverse_value_delta,
    })

    update_in_memory_rollover_mutation({
      target = entity_id and rollover_data.entities or rollover_data,
      entity_id = entity_id,
      balance_delta = inverse_balance_delta,
      usage_delta = inverse_usage_delta,
    })

    return {
      applied = true,
      unwind_iteration_value = unwind_iteration_value,
      remaining_unwind_value = remaining_unwind_value - unwind_iteration_value,
      error = nil,
    }
  end

  return {
    applied = false,
    unwind_iteration_value = 0,
    remaining_unwind_value = remaining_unwind_value,
    error = 'INVALID_LOCK_ITEM_TARGET_TYPE',
  }
end

-- ============================================================================
-- STEP 4: Iterate through receipt items backwards and unwind them
--
-- params:
--   context: table
--   items: ordered receipt items
--   unwind_value: positive magnitude
--
-- Returns:
--   {
--     applied = boolean,
--     remaining_unwind_value = number,
--     iterations = array,
--     error = string | nil,
--   }
-- ============================================================================
local function unwind_lock_items(params)
  local context = params.context
  local items = safe_table(params.items)
  local remaining_unwind_value = safe_number(params.unwind_value)
  local iterations = {}

  if remaining_unwind_value <= 0 then
    return {
      applied = false,
      remaining_unwind_value = 0,
      iterations = iterations,
      error = nil,
    }
  end

  for index = #items, 1, -1 do
    if remaining_unwind_value <= 0 then
      break
    end

    local item = items[index]
    local result = unwind_lock_item_iteration({
      context = context,
      item = item,
      remaining_unwind_value = remaining_unwind_value,
    })

    if not is_nil(result.error) then
      return {
        applied = #iterations > 0,
        remaining_unwind_value = remaining_unwind_value,
        iterations = iterations,
        error = result.error,
      }
    end

    if result.applied then
      table.insert(iterations, {
        item = item,
        unwind_iteration_value = result.unwind_iteration_value,
      })
    end

    remaining_unwind_value = result.remaining_unwind_value
  end

  return {
    applied = #iterations > 0,
    remaining_unwind_value = remaining_unwind_value,
    iterations = iterations,
    error = nil,
  }
end

-- ============================================================================
-- STEP 5: Collect modified IDs from unwind iterations
-- ============================================================================
local function collect_unwind_modified_ids(params)
  local iterations = safe_table(params.iterations)
  local modified_customer_entitlement_ids = {}
  local modified_rollover_ids = {}
  local seen_customer_entitlements = {}
  local seen_rollovers = {}

  for _, iteration in ipairs(iterations) do
    local item = iteration.item or {}

    if not is_nil(item.customer_entitlement_id)
      and not seen_customer_entitlements[item.customer_entitlement_id]
    then
      seen_customer_entitlements[item.customer_entitlement_id] = true
      table.insert(modified_customer_entitlement_ids, item.customer_entitlement_id)
    end

    if not is_nil(item.rollover_id)
      and not seen_rollovers[item.rollover_id]
    then
      seen_rollovers[item.rollover_id] = true
      table.insert(modified_rollover_ids, item.rollover_id)
    end
  end

  return {
    modified_customer_entitlement_ids = modified_customer_entitlement_ids,
    modified_rollover_ids = modified_rollover_ids,
  }
end

-- ============================================================================
-- STEP 6: Unwind a lock receipt against an initialized context
-- ============================================================================
local function unwind_lock_on_context(params)
  local context = params.context
  local lock_receipt_key = params.lock_receipt_key
  local unwind_value = params.unwind_value or 0
  local empty_result = {
    modified_customer_entitlement_ids = cjson.decode('[]'),
    modified_rollover_ids = cjson.decode('[]'),
    mutation_logs = cjson.decode('[]'),
  }

  local receipt = load_lock_receipt(lock_receipt_key)

  local pending_error = require_pending_receipt(receipt)
  if not is_nil(pending_error) then
    empty_result.error = pending_error
    return empty_result
  end

  local items = receipt.items or cjson.decode('[]')
  local unwind_items_result = unwind_lock_items({
    context = context,
    items = items,
    unwind_value = unwind_value,
  })

  if not is_nil(unwind_items_result.error) then
    empty_result.error = unwind_items_result.error
    return empty_result
  end

  local modified_ids = collect_unwind_modified_ids({
    iterations = unwind_items_result.iterations,
  })

  return {
    error = cjson.null,
    unwind_value = unwind_value,
    remaining_unwind_value = unwind_items_result.remaining_unwind_value,
    modified_customer_entitlement_ids = modified_ids.modified_customer_entitlement_ids,
    modified_rollover_ids = modified_ids.modified_rollover_ids,
    mutation_logs = context.mutation_logs,
  }
end
