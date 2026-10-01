-- ============================================================================
-- ALLOCATION GATE (V2)
-- Holds an entity to its share of the customer's shared credits: on shared rows
-- it may draw its own unused share, then credits nobody holds. One gate per
-- allocated feature, indexed by shared row id. Mirrors
-- packages/balance-engine/src/allocations. Counters ride usage_windows entries
-- tagged allocation_role + allocation_key, which the usage-window gate ignores.
-- ============================================================================

-- Gates by the shared row ids they hold, or nil when nothing is allocated.
local function index_allocation_gates(gates)
  if is_nil(gates) then
    return nil
  end
  local by_ent_id = {}
  local any = false
  for _, gate in pairs(gates) do
    for ent_id, _ in pairs(safe_table(gate.shared_ent_ids)) do
      by_ent_id[ent_id] = gate
      any = true
    end
  end
  return any and by_ent_id or nil
end

local function allocation_gate_of(gates_by_ent_id, ent_id)
  if is_nil(gates_by_ent_id) or is_nil(ent_id) then
    return nil
  end
  return gates_by_ent_id[ent_id]
end

local function allocation_entry(context, gate, role)
  for _, feature_windows in pairs(context.usage_windows or {}) do
    for _, entry in pairs(feature_windows.entries or {}) do
      if entry.allocation_role == role
          and entry.limit ~= nil
          and entry.limit.allocation_key == gate.key then
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

local function held_unused(context, gate)
  return safe_number(gate.requested_total)
    - allocation_usage(allocation_entry(context, gate, 'claimed'))
end

-- Snapshots each gate's pot and stored claimed before any unwind or draw; a stale scale is re-solved from them.
local function snapshot_allocation_pots(context, gates_by_ent_id)
  for _, gate in pairs(gates_by_ent_id or {}) do
    if gate.pot_at_start == nil then
      gate.pot_at_start = shared_remaining(context, gate)
      local claimed_entry = allocation_entry(context, gate, 'claimed')
      gate.claimed_at_start = claimed_entry and safe_number(claimed_entry.current_usage) or 0
    end
  end
end

-- Mirrors effectiveAllocationScale: the pot at cycle start is remaining + claimed, so draws leave it fixed.
local function stored_allocation_scale(gate)
  if gate.scale_is_current == true then
    return safe_number(gate.scale)
  end
  local requested_total = safe_number(gate.requested_total)
  if requested_total <= 0 then
    return 1
  end
  local pot_at_cycle_start = math.max(0, safe_number(gate.pot_at_start))
    + math.max(0, safe_number(gate.claimed_at_start))
  return math.min(1, pot_at_cycle_start / requested_total)
end

-- A cut solved before the pot grew stops binding once every unused promise fits again.
local function effective_allocation_scale(context, gate, remaining)
  if held_unused(context, gate) <= remaining then
    return 1
  end
  return stored_allocation_scale(gate)
end

local function own_unused_of(context, gate, scale)
  if is_nil(gate.requested) then
    return 0
  end
  local usage = allocation_usage(allocation_entry(context, gate, 'entity'))
  local granted = allocation_granted(safe_number(gate.requested), usage, scale)
  return math.max(0, granted - usage)
end

-- { own_unused, unallocated } in credits, as they stand mid-deduction.
local function allocation_gate_now(context, gate)
  local remaining = shared_remaining(context, gate)
  local scale = effective_allocation_scale(context, gate, remaining)
  local own_unused = own_unused_of(context, gate, scale)
  if scale < 1 then
    return own_unused, 0
  end
  return own_unused, math.max(0, remaining - held_unused(context, gate))
end

-- Max tracked units this shared row may give, or nil when the gate doesn't bind
-- (row not gated, or the entity's headroom already covers the row's credits).
local function get_available_from_allocation(params)
  local gate = allocation_gate_of(params.gates, params.ent_id)
  if gate == nil then
    return nil
  end
  local own_unused, unallocated = allocation_gate_now(params.context, gate)
  local headroom = math.max(0, own_unused + unallocated)
  if headroom >= safe_number(params.shared_balance_before) then
    return nil
  end
  if headroom <= 0 then
    return 0
  end
  if not is_nil(params.rate_card) then
    return credit_rate_units_for_credit_change({
      rate_card = params.rate_card,
      current_units = params.current_units,
      requested_units = params.requested_units,
      allowed_credit_change = headroom,
    })
  end
  return headroom / (params.credit_cost or 1)
end

-- Gives credits back: the entity's counter drops, claimed only by what falls back under its share.
local function release_allocation(context, gate, credits)
  local entity_entry = allocation_entry(context, gate, 'entity')
  if entity_entry == nil then
    return
  end
  local usage = allocation_usage(entity_entry)
  local restored = math.min(credits, math.max(0, usage))
  if restored <= 0 then
    return
  end
  entity_entry.consumed = entity_entry.consumed - restored
  local claimed_entry = allocation_entry(context, gate, 'claimed')
  if claimed_entry ~= nil and not is_nil(gate.requested) then
    local requested = safe_number(gate.requested)
    local claimed_before = math.min(usage, requested)
    local claimed_after = math.min(usage - restored, requested)
    claimed_entry.consumed = claimed_entry.consumed + (claimed_after - claimed_before)
  end
end

-- Counts a shared draw (all of it against the entity, its own-share part as claimed); negative is a refund.
local function consume_allocation(params)
  local context = params.context
  local gate = allocation_gate_of(params.gates, params.ent_id)
  local credits = params.credits or 0
  if gate == nil or credits == 0 then
    return
  end
  local entity_entry = allocation_entry(context, gate, 'entity')
  if entity_entry == nil then
    return
  end
  if credits < 0 then
    release_allocation(context, gate, -credits)
    return
  end
  -- credits already left the shared row, so the gate is read as it stood before them.
  local scale = effective_allocation_scale(
    context,
    gate,
    shared_remaining(context, gate) + credits
  )
  local own_unused = own_unused_of(context, gate, scale)
  entity_entry.consumed = entity_entry.consumed + credits
  local claimed_entry = allocation_entry(context, gate, 'claimed')
  if claimed_entry ~= nil then
    claimed_entry.consumed = claimed_entry.consumed + math.min(credits, own_unused)
  end
end

-- A lock unwind gives shared credits back the same way a refund does; rollovers and entity balances aren't shared.
local function release_allocation_for_unwind(params)
  local context = params.context
  local credits_by_gate = {}
  local gate_by_key = {}
  for _, iteration in ipairs(safe_table(params.iterations)) do
    local item = iteration.item or {}
    local gate = nil
    if is_nil(item.rollover_id) and is_nil(item.entity_id) then
      gate = allocation_gate_of(params.gates, item.customer_entitlement_id)
    end
    local credits = safe_number(iteration.balance_credits)
    if gate ~= nil and credits ~= 0 then
      gate_by_key[gate.key] = { gate = gate, ent_id = item.customer_entitlement_id }
      credits_by_gate[gate.key] = (credits_by_gate[gate.key] or 0) + credits
    end
  end
  -- Unwinding a draw gives credits back; unwinding a refund takes them again.
  for key, credits in pairs(credits_by_gate) do
    if credits > 0 then
      release_allocation(context, gate_by_key[key].gate, credits)
    elseif credits < 0 then
      consume_allocation({
        context = context,
        gates = params.gates,
        ent_id = gate_by_key[key].ent_id,
        credits = -credits,
      })
    end
  end
end
