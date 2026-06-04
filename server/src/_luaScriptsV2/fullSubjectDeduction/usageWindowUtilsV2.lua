-- ============================================================================
-- USAGE WINDOW UTILITIES (V2)
-- Hard windowed usage-limit enforcement, evaluated at the orchestration layer
-- against ACTUAL consumed amounts (post-deduction, pre-write).
--
-- Counters live inline on the anchor cus_ent's subject_balance.usage_windows as
-- a lean ARRAY of rows mirroring the usage_windows table (DbUsageWindow):
--   { id, customer_entitlement_id, feature_id, internal_feature_id,
--     window_start_at, window_end_at, usage, updated_at }
-- A window is identified by (customer_entitlement_id, feature_id,
-- window_start_at) -- the table's unique key. The current window is
-- found-or-created; a rolled window has a different window_start_at, so its
-- counter starts fresh at 0 and old windows are pruned.
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

  -- Reset a non-array blob to []: a legacy keyed-map blob (pre-array deploy) whose
  -- string keys ipairs would skip and table.insert would corrupt into a
  -- sync-breaking JSON object. The current window restarts at 0 (one-time cost).
  local windows = ent_data.subject_balance.usage_windows
  if type(windows) ~= 'table'
      or (next(windows) ~= nil and windows[1] == nil) then
    windows = new_empty_array()
    ent_data.subject_balance.usage_windows = windows
  end

  return windows
end

-- The array is one anchor cus_ent's rows, so customer_entitlement_id is implied;
-- a window is the row matching (feature_id, window_start_at).
local function find_usage_window(windows, feature_id, window_start_at)
  for _, window in ipairs(windows) do
    if window.feature_id == feature_id
        and safe_number(window.window_start_at) == window_start_at then
      return window
    end
  end
  return nil
end

-- Stable id matching the table's unique key, so the async sync upserts the same
-- row each window rather than inserting duplicates.
local function build_usage_window_id(limit)
  return limit.anchor_customer_entitlement_id
    .. ':' .. limit.feature_id
    .. ':' .. string.format('%.0f', limit.window_start_at)
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
      local existing = find_usage_window(
        windows,
        limit.feature_id,
        limit.window_start_at
      )
      local current_usage = existing and safe_number(existing.usage) or 0
      if current_usage + consumed
          > safe_number(limit.limit) + USAGE_WINDOW_EPSILON then
        return limit.feature_id
      end
    end
  end

  return nil
end

-- Applies the consumed amount to each anchor counter (find-or-create the current
-- window row), prunes closed windows, and marks the anchor dirty so
-- apply_pending_writes persists it.
local function increment_usage_window_counters(params)
  local context = params.context
  local limits = params.usage_window_limits or {}
  local now = params.now

  for _, limit in ipairs(limits) do
    local ent_data =
      context.customer_entitlements[limit.anchor_customer_entitlement_id]
    local windows = get_anchor_usage_windows(
      context,
      limit.anchor_customer_entitlement_id
    )
    if not is_nil(windows) then
      -- Rebuild (rather than nil-out) so the array stays hole-free and cjson
      -- re-encodes it as [] not {}; prune every pass so it never grows for
      -- sporadically-active features.
      local kept = new_empty_array()
      local pruned = false
      for _, window in ipairs(windows) do
        if type(window) == 'table'
            and safe_number(window.window_end_at) < now then
          pruned = true
        else
          table.insert(kept, window)
        end
      end
      if pruned then
        ent_data.subject_balance.usage_windows = kept
        windows = kept
      end

      local consumed = usage_window_consumed({
        limit = limit,
        updates = params.updates,
        amount_to_deduct = params.amount_to_deduct,
        remaining_amount = params.remaining_amount,
      })

      if consumed > USAGE_WINDOW_EPSILON then
        local existing = find_usage_window(
          windows,
          limit.feature_id,
          limit.window_start_at
        )
        if is_nil(existing) then
          existing = {
            id = build_usage_window_id(limit),
            customer_entitlement_id = limit.anchor_customer_entitlement_id,
            feature_id = limit.feature_id,
            internal_feature_id = limit.internal_feature_id,
            window_start_at = limit.window_start_at,
            window_end_at = limit.window_end_at,
            usage = 0,
            updated_at = now,
          }
          table.insert(windows, existing)
        end

        existing.usage = safe_number(existing.usage) + consumed
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
