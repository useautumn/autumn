-- ============================================================================
-- READ USAGE WINDOWS
-- Loads customer-scoped usage-window counter state into the deduction context
-- (sibling of read_subject_balances). Counters live in the capped feature's
-- balance hash under the reserved '_usage_windows' field, as a lean ARRAY of
-- rows mirroring the usage_windows table (DbUsageWindow):
--   { id, internal_customer_id, internal_entity_id, feature_id,
--     internal_feature_id, anchor_customer_entitlement_id,
--     window_start_at, window_end_at, usage, updated_at }
--
-- Each loaded entry also carries the deduction-time runtime state the per-ent
-- gate consumes: the resolved limit, its dimension, the remaining `headroom`
-- (limit - current window usage, decremented as the deduction passes drain
-- it), and `consumed` (this operation's total, in the limit's native unit).
--
-- FAIL OPEN: a missing/undecodable field (or an undeclared balance key) loads
-- as an empty counter set -- the window simply restarts. Stale-cache guards
-- may return in a future iteration.
-- ============================================================================

local USAGE_WINDOWS_FIELD = '_usage_windows'

-- ONE mutable counter row per scope: a row matches its limit on
-- internal_entity_id alone. Bounds are payload, not identity.
local function find_usage_window(windows, limit)
  local limit_entity = limit.internal_entity_id
  for _, window in ipairs(windows) do
    if type(window) == 'table' then
      local window_entity = window.internal_entity_id
      local entities_match =
        (is_nil(limit_entity) and is_nil(window_entity))
        or limit_entity == window_entity
      if entities_match then
        return window
      end
    end
  end
  return nil
end

-- Returns { [feature_id] = { balance_key, windows, dirty, limit,
-- dimension_type, headroom, consumed } }, one entry per distinct capped
-- feature in usage_window_limits.
local function read_usage_windows(params)
  local limits = params.usage_window_limits or {}
  local balance_keys_by_feature_id =
    safe_table(params.balance_keys_by_feature_id)
  local usage_windows = {}

  for _, limit in ipairs(limits) do
    local feature_id = limit.feature_id
    if usage_windows[feature_id] == nil then
      local balance_key = balance_keys_by_feature_id[feature_id]
      local windows = nil

      if not is_nil(balance_key) then
        local raw_value = redis.call('HGET', balance_key, USAGE_WINDOWS_FIELD)
        windows = safe_decode(raw_value)
      end

      if type(windows) ~= 'table' then
        windows = new_empty_array()
      end

      -- cjson decodes an empty JSON object ({}) to the same empty table as [];
      -- a non-empty map-like blob should be impossible for this field, but
      -- reset it defensively rather than letting ipairs skip rows silently.
      if next(windows) ~= nil and windows[1] == nil then
        windows = new_empty_array()
      end

      local existing = find_usage_window(windows, limit)
      -- A count is valid only within its exact stamped window: derive 0 when
      -- it expired OR its bounds no longer match the current derivation (the
      -- lazy roll persists the zero; this read must not trust it blindly).
      local current_usage = 0
      if not is_nil(existing)
          and safe_number(existing.window_end_at) > safe_number(params.now)
          and safe_number(existing.window_start_at) == limit.window_start_at
      then
        current_usage = safe_number(existing.usage)
      end
      local headroom = safe_number(limit.limit) - current_usage
      if headroom < 0 then
        headroom = 0
      end

      usage_windows[feature_id] = {
        balance_key = not is_nil(balance_key) and balance_key or nil,
        windows = windows,
        dirty = false,
        limit = limit,
        dimension_type = limit.dimension_type,
        headroom = headroom,
        consumed = 0,
      }
    end
  end

  return usage_windows
end
