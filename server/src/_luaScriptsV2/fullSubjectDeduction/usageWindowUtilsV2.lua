-- ============================================================================
-- USAGE WINDOW UTILITIES (V2)
-- Hard windowed usage-limit enforcement, evaluated at the orchestration layer
-- against ACTUAL consumed amounts (post-deduction, pre-write).
--
-- Counters live inline on the anchor cus_ent's subject_balance.usage_windows,
-- keyed by the deterministic window key built in TS. The window key includes
-- window_start_at, so the current window's counter is found-or-created at
-- limit.key and a rolled window is simply a different (absent) key.
-- ============================================================================

-- Tolerance for float drift (credit-ratio conversions leave sub-nano noise).
local USAGE_WINDOW_EPSILON = 1e-9

local function get_anchor_usage_windows(context, anchor_customer_entitlement_id)
  if is_nil(anchor_customer_entitlement_id) then
    return nil
  end

  local ent_data = context.customer_entitlements[anchor_customer_entitlement_id]
  if not ent_data or not ent_data.subject_balance then
    return nil
  end

  if type(ent_data.subject_balance.usage_windows) ~= 'table' then
    ent_data.subject_balance.usage_windows = {}
  end

  return ent_data.subject_balance.usage_windows
end

-- Actually-consumed amount for a limit, in its native unit. metered_feature
-- counts feature units (the tracked total); balance counts credits drained from
-- the anchor pool (its `deducted`, which is in credits).
local function usage_window_consumed(params)
  local limit = params.limit
  local updates = params.updates

  if limit.dimension_type == 'balance' then
    local anchor_update = updates[limit.anchor_customer_entitlement_id]
    return anchor_update and safe_number(anchor_update.deducted) or 0
  end

  return safe_number(params.amount_to_deduct) - safe_number(params.remaining_amount)
end

-- Returns the feature_id of the first limit that would be exceeded (so the
-- caller can hard-reject), or nil if every limit has room. Null/missing anchor
-- fails closed: a cap that cannot resolve an owner must not silently allow.
local function check_usage_window_limits(params)
  local context = params.context
  local limits = params.usage_window_limits or {}

  for _, limit in ipairs(limits) do
    local windows = get_anchor_usage_windows(
      context,
      limit.anchor_customer_entitlement_id
    )
    if is_nil(windows) then
      return limit.feature_id
    end

    local consumed = usage_window_consumed({
      limit = limit,
      updates = params.updates,
      amount_to_deduct = params.amount_to_deduct,
      remaining_amount = params.remaining_amount,
    })

    if consumed > USAGE_WINDOW_EPSILON then
      local existing = windows[limit.key]
      local current_usage = existing and safe_number(existing.usage_amount) or 0
      if current_usage + consumed
          > safe_number(limit.limit) + USAGE_WINDOW_EPSILON then
        return limit.feature_id
      end
    end
  end

  return nil
end

-- Applies the consumed amount to each anchor counter (find-or-create at the
-- current window key), prunes closed sibling windows, and marks the anchor dirty
-- so apply_pending_writes persists it (even when the anchor's balance did not
-- change, or when only a prune happened).
local function increment_usage_window_counters(params)
  local context = params.context
  local limits = params.usage_window_limits or {}
  local now = params.now

  for _, limit in ipairs(limits) do
    local windows = get_anchor_usage_windows(
      context,
      limit.anchor_customer_entitlement_id
    )
    if not is_nil(windows) then
      -- Prune closed windows every pass (not only when consuming) so the map
      -- does not grow for sporadically-active features (lifetime never closes).
      local pruned = false
      for window_key, window in pairs(windows) do
        if window_key ~= limit.key
            and type(window) == 'table'
            and safe_number(window.window_end_at) < now
        then
          windows[window_key] = nil
          pruned = true
        end
      end

      local consumed = usage_window_consumed({
        limit = limit,
        updates = params.updates,
        amount_to_deduct = params.amount_to_deduct,
        remaining_amount = params.remaining_amount,
      })

      if consumed > USAGE_WINDOW_EPSILON then
        -- balance_amount is audit-only; for metered caps it captures just the
        -- anchor pool's credits, not every pool the track touched.
        local consumed_credits = 0
        local anchor_update = params.updates[limit.anchor_customer_entitlement_id]
        if anchor_update then
          consumed_credits = safe_number(anchor_update.deducted)
        end

        local existing = windows[limit.key]
        if is_nil(existing) then
          existing = {
            key = limit.key,
            dimension_type = limit.dimension_type,
            dimension_feature_id = limit.dimension_feature_id or cjson.null,
            scope_type = limit.scope_type,
            entity_id = limit.entity_id or cjson.null,
            internal_entity_id = limit.internal_entity_id or cjson.null,
            interval = limit.interval,
            window_start_at = limit.window_start_at,
            window_end_at = limit.window_end_at,
            usage_amount = 0,
            balance_amount = 0,
          }
          windows[limit.key] = existing
        end

        existing.usage_amount = safe_number(existing.usage_amount) + consumed
        existing.balance_amount =
          safe_number(existing.balance_amount) + consumed_credits
        existing.limit_snapshot = safe_number(limit.limit)
        existing.updated_at = now

        mark_customer_entitlement_for_update(
          context,
          limit.anchor_customer_entitlement_id
        )
      elseif pruned then
        mark_customer_entitlement_for_update(
          context,
          limit.anchor_customer_entitlement_id
        )
      end
    end
  end
end
