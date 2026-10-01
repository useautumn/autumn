-- ============================================================================
-- ALLOCATION GATE (V2)
-- Holds an entity to its share of the customer's shared credits: on shared rows
-- it may draw its own unused share, then credits nobody holds. Mirrors
-- packages/balance-engine/src/allocations. Counters ride usage_windows entries
-- tagged allocation_role, which the usage-window gate itself ignores.
-- ============================================================================

local function allocation_entry(context, role)
  for _, feature_windows in pairs(context.usage_windows or {}) do
    for _, entry in pairs(feature_windows.entries or {}) do
      if entry.allocation_role == role then
        return entry
      end
    end
  end
  return nil
end

local function allocation_usage(entry)
  if entry == nil then
    return 0
  end
  return safe_number(entry.current_usage) + safe_number(entry.consumed)
end

local function allocation_granted(requested, usage, scale)
  if scale >= 1 then
    return requested
  end
  local claimed = math.min(usage, requested)
  return math.max(claimed, math.floor(requested * scale))
end

local function shared_remaining(context, gate)
  local total = 0
  for ent_id, _ in pairs(gate.shared_ent_ids or {}) do
    local ent_data = context.customer_entitlements[ent_id]
    if ent_data then
      total = total + math.max(0, safe_number(ent_data.balance))
    end
  end
  return total
end

-- { own_unused, unallocated } in credits, as they stand mid-deduction.
local function allocation_gate_now(context, gate)
  local scale = safe_number(gate.scale)
  local own_unused = 0
  if not is_nil(gate.requested) then
    local usage = allocation_usage(allocation_entry(context, 'entity'))
    local granted = allocation_granted(safe_number(gate.requested), usage, scale)
    own_unused = math.max(0, granted - usage)
  end
  if scale < 1 then
    return own_unused, 0
  end
  local held_unused = safe_number(gate.requested_total)
    - allocation_usage(allocation_entry(context, 'claimed'))
  local unallocated = math.max(0, shared_remaining(context, gate) - held_unused)
  return own_unused, unallocated
end

local function is_allocation_gated(gate, ent_id)
  return not is_nil(gate) and gate.shared_ent_ids[ent_id] == true
end

-- Max tracked units this shared row may give, or nil when the row isn't gated.
local function get_available_from_allocation(params)
  local gate = params.gate
  if not is_allocation_gated(gate, params.ent_id) then
    return nil
  end
  local own_unused, unallocated = allocation_gate_now(params.context, gate)
  return math.max(0, own_unused + unallocated) / (params.credit_cost or 1)
end

-- Gives credits back: the entity's counter drops, claimed only by what falls back under its share.
local function release_allocation(gate, entity_entry, claimed_entry, credits)
  local usage = allocation_usage(entity_entry)
  local restored = math.min(credits, math.max(0, usage))
  if restored <= 0 then
    return
  end
  entity_entry.consumed = entity_entry.consumed - restored
  if claimed_entry ~= nil and not is_nil(gate.requested) then
    local requested = safe_number(gate.requested)
    local claimed_before = math.min(usage, requested)
    local claimed_after = math.min(usage - restored, requested)
    claimed_entry.consumed = claimed_entry.consumed + (claimed_after - claimed_before)
  end
end

-- Counts a shared draw (all of it against the entity, its own-share part as claimed); negative is a refund.
local function consume_allocation(params)
  local gate = params.gate
  local credits = params.credits or 0
  if not is_allocation_gated(gate, params.ent_id) or credits == 0 then
    return
  end
  local entity_entry = allocation_entry(params.context, 'entity')
  if entity_entry == nil then
    return
  end
  if credits < 0 then
    release_allocation(gate, entity_entry, allocation_entry(params.context, 'claimed'), -credits)
    return
  end
  -- credits already left the shared row, so own_unused is read before counting them.
  local own_unused = 0
  if not is_nil(gate.requested) then
    local usage = allocation_usage(entity_entry)
    local granted = allocation_granted(
      safe_number(gate.requested),
      usage,
      safe_number(gate.scale)
    )
    own_unused = math.max(0, granted - usage)
  end
  entity_entry.consumed = entity_entry.consumed + credits
  local claimed_entry = allocation_entry(params.context, 'claimed')
  if claimed_entry ~= nil then
    claimed_entry.consumed = claimed_entry.consumed + math.min(credits, own_unused)
  end
end
