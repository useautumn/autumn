-- ============================================================================
-- USAGE WINDOW CONTEXT UTILITIES (V2)
-- Hard windowed usage-limit enforcement against context.usage_windows (loaded
-- by init_context via read_usage_windows), integrated into the deduction
-- passes the same way spend limits are:
--   per-ent gate (get_available_from_usage_windows, in the deduction loop)
--   -> consume headroom as each ent drains (consume_usage_window_headroom)
--   -> update_in_memory_usage_window (mark dirty) -> apply_usage_window_writes.
-- A window-capped leftover is handled by the standard overage_behaviour path
-- ('cap' applies the partial deduction, 'reject' returns INSUFFICIENT_BALANCE)
-- -- no window-specific error.
--
-- CONFIG IN:    usage_window_limits[] -- resolved caps (limit, bounds,
--               dimension) from fullSubjectToUsageWindowLimits.
-- COUNTERS OUT: context.usage_windows[feature_id].windows -- DbUsageWindow
--               rows (usage amounts), NOT the config.
--
-- Units: the deduction loop works in TRACKED-FEATURE UNITS; each ent's
-- credit_cost converts them to that ent's balance units. A metered_feature
-- limit counts tracked units (applies to every ent in the deduction set); a
-- balance limit counts credits drained from ents OF the capped feature, so
-- headroom converts via credit_cost at the gate.
-- ============================================================================

-- Tolerance for float drift (credit-ratio conversions leave sub-nano noise).
local USAGE_WINDOW_EPSILON = 1e-9

-- Max tracked units deductible from ONE ent given every applicable window
-- limit, or nil when unbounded. Windows never store a conversion -- headroom
-- lives in the limit's own unit (tracked units for metered dims, credits for
-- balance dims) and is converted HERE, per call, with the calling ent's
-- credit_cost: the same balance-dim headroom yields different unit allowances
-- for ents with different credit ratios, and only ents OF the capped feature
-- are bound by it at all. Metered dims need no conversion (the deduction loop
-- is denominated in tracked units, whatever pool funds them).
--
-- Pass ent_feature_id = nil for the rollover phase: metered limits still
-- apply (rollover drains consume tracked units), balance limits do not
-- (parity with spend limits, whose overage math also ignores rollover
-- drains).
local function get_available_from_usage_windows(params)
  local context = params.context
  local ent_feature_id = params.ent_feature_id
  local credit_cost = params.credit_cost or 1
  local allowed = nil

  for feature_id, feature_windows in pairs(context.usage_windows or {}) do
    for _, entry in pairs(feature_windows.entries or {}) do
      local headroom = entry.headroom
      if headroom <= USAGE_WINDOW_EPSILON then
        headroom = 0
      end

      local units = nil
      if entry.dimension_type ~= 'balance' then
        units = headroom
      elseif not is_nil(ent_feature_id) and feature_id == ent_feature_id then
        units = headroom / credit_cost
      end

      if units ~= nil and (allowed == nil or units < allowed) then
        allowed = units
      end
    end
  end

  return allowed
end

-- Records `units` tracked units drained from an ent against every applicable
-- limit: metered limits consume units 1:1, balance limits consume
-- units * credit_cost (credits). Decrements live headroom so the next ent's
-- gate sees it, and accumulates `consumed` for the counter increment.
local function consume_usage_window_headroom(params)
  local context = params.context
  local ent_feature_id = params.ent_feature_id
  local credit_cost = params.credit_cost or 1
  local units = params.units or 0

  if units <= 0 then
    return
  end

  for feature_id, feature_windows in pairs(context.usage_windows or {}) do
    for _, entry in pairs(feature_windows.entries or {}) do
      local consumed = nil
      if entry.dimension_type ~= 'balance' then
        consumed = units
      elseif not is_nil(ent_feature_id) and feature_id == ent_feature_id then
        consumed = units * credit_cost
      end

      if consumed ~= nil and consumed > 0 then
        entry.headroom = entry.headroom - consumed
        if entry.headroom < 0 then
          entry.headroom = 0
        end
        entry.consumed = entry.consumed + consumed
      end
    end
  end
end

-- Sibling of append_mutation_log: records which window row moved and by how
-- much (usage_delta in the limit's native unit). Kept as its own stream so
-- mutation_logs stays entitlement/rollover-shaped.
local function append_usage_window_mutation(params)
  local context = params.context
  table.insert(context.usage_window_mutations, {
    usage_window_id = params.usage_window_id or cjson.null,
    feature_id = params.feature_id,
    internal_entity_id = params.internal_entity_id or cjson.null,
    filter_key = params.filter_key or cjson.null,
    window_start_at = params.window_start_at,
    usage_delta = params.usage_delta or 0,
  })
end

-- In-memory mutation for one limit (sibling of
-- update_in_memory_customer_entitlement_mutation). ONE mutable row per scope:
-- zero the count if its stored window closed (defensive guard -- the lazy
-- roll action owns the roll), stamp the current bounds/anchor, add consumed.
local function update_in_memory_usage_window(params)
  local context = params.context
  local limit = params.limit
  local now = params.now

  local feature_windows = context.usage_windows[limit.feature_id]
  if feature_windows == nil then
    return
  end
  local entry = feature_windows.entries[limit.key]
  if entry == nil then
    return
  end

  if entry.consumed > USAGE_WINDOW_EPSILON then
    local existing = find_usage_window(feature_windows.windows, limit)
    if is_nil(existing) then
      -- The TS-minted candidate id is used ONLY at creation; under concurrency
      -- the second request finds the first one's row and its id is discarded.
      existing = {
        id = limit.new_window_id,
        internal_customer_id = limit.internal_customer_id,
        internal_entity_id = limit.internal_entity_id,
        feature_id = limit.feature_id,
        internal_feature_id = limit.internal_feature_id,
        filter_key = limit.filter_key,
        usage = 0,
      }
      table.insert(feature_windows.windows, existing)
    elseif safe_number(existing.window_end_at) <= now
        or safe_number(existing.window_start_at) ~= limit.window_start_at
    then
      -- A count never survives its stamped window: zero on expiry AND on any
      -- bounds re-derivation mismatch (plan change).
      existing.usage = 0
    end

    existing.window_start_at = limit.window_start_at
    existing.window_end_at = limit.window_end_at
    existing.anchor_customer_entitlement_id =
      limit.anchor_customer_entitlement_id
    existing.usage = safe_number(existing.usage) + entry.consumed
    existing.updated_at = now
    feature_windows.dirty = true

    append_usage_window_mutation({
      context = context,
      usage_window_id = existing.id,
      feature_id = limit.feature_id,
      internal_entity_id = limit.internal_entity_id,
      filter_key = limit.filter_key,
      window_start_at = limit.window_start_at,
      usage_delta = entry.consumed,
    })
  end
end

-- Applies each limit's in-flight consumed amount to its counter row.
-- Mirrors a lock UNWIND onto the counters: each applied unwind iteration
-- frees window headroom (metered dims by tracked units, balance dims by the
-- credits restored to that feature's entitlements). Clamped at 0; only the
-- limit's CURRENT window is decremented (a roll between lock and unwind
-- forfeits the old window's count, which is the conservative outcome).
local function decrement_usage_windows_for_unwind(params)
  local context = params.context
  local iterations = safe_table(params.iterations)
  local now = params.now

  if is_nil(context.usage_windows) or #iterations == 0 then
    return
  end

  local total_units = 0
  local credits_by_feature_id = {}

  for _, iteration in ipairs(iterations) do
    local units = safe_number(iteration.unwind_iteration_value)
    total_units = total_units + units

    local item = iteration.item or {}
    local ent_feature_id = nil
    local ent = context.customer_entitlements[item.customer_entitlement_id]
    if ent then
      ent_feature_id = ent.feature_id
    elseif item.rollover_id and context.rollovers[item.rollover_id] then
      local rollover_ent = context.customer_entitlements[
        context.rollovers[item.rollover_id].cus_ent_id
      ]
      if rollover_ent then
        ent_feature_id = rollover_ent.feature_id
      end
    end

    if ent_feature_id then
      local credits = units * safe_number(item.credit_cost or 1)
      credits_by_feature_id[ent_feature_id] =
        (credits_by_feature_id[ent_feature_id] or 0) + credits
    end
  end

  for feature_id, feature_windows in pairs(context.usage_windows) do
    for _, entry in pairs(feature_windows.entries or {}) do
      local amount = 0
      if entry.dimension_type == 'balance' then
        amount = credits_by_feature_id[feature_id] or 0
      else
        amount = total_units
      end

      if amount > 0 then
        local existing = find_usage_window(
          feature_windows.windows,
          entry.limit
        )
        if not is_nil(existing) then
          local current = safe_number(existing.usage)
          local next_usage = current - amount
          if next_usage < 0 then
            next_usage = 0
          end

          if next_usage ~= current then
            existing.usage = next_usage
            existing.updated_at = now
            feature_windows.dirty = true

            append_usage_window_mutation({
              context = context,
              usage_window_id = existing.id,
              feature_id = entry.limit.feature_id,
              internal_entity_id = entry.limit.internal_entity_id,
              filter_key = entry.limit.filter_key,
              window_start_at = entry.limit.window_start_at,
              usage_delta = next_usage - current,
            })
          end
        end
      end
    end
  end
end

local function increment_usage_window_counters(params)
  local context = params.context
  local limits = params.usage_window_limits or {}

  for _, limit in ipairs(limits) do
    update_in_memory_usage_window({
      context = context,
      limit = limit,
      now = params.now,
    })
  end
end

-- Persists dirty counter arrays back to their '_usage_windows' fields
-- (sibling of apply_pending_writes; direct HSET like updateAggregatedBalances
-- since the cusEnt pending-write path is keyed by entitlement blobs).
-- The EXPIRE guard is load-bearing under fail-open: a write to a hash that
-- did not exist (capped feature with no entitlements and no rebuild yet)
-- must not create an immortal key.
local function apply_usage_window_writes(context, ttl_seconds)
  local ttl = tonumber(ttl_seconds)

  for _, feature_windows in pairs(context.usage_windows or {}) do
    if feature_windows.dirty and not is_nil(feature_windows.balance_key) then
      redis.call(
        'HSET',
        feature_windows.balance_key,
        USAGE_WINDOWS_FIELD,
        cjson.encode(feature_windows.windows)
      )
      if ttl and ttl > 0
          and redis.call('TTL', feature_windows.balance_key) < 0 then
        redis.call('EXPIRE', feature_windows.balance_key, ttl)
      end
    end
  end
end

-- Result payload: { [feature_id] = windows[] } for every loaded capped
-- feature, so the TS caller can refresh the in-flight subject and hand the
-- post-deduction counters to syncItemV4 (no Redis re-read).
local function usage_windows_to_result(context)
  local result = nil
  for feature_id, feature_windows in pairs(context.usage_windows or {}) do
    if result == nil then
      result = {}
    end
    result[feature_id] = feature_windows.windows
  end
  return result
end
