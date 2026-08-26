-- ============================================================================
-- DEDUCT FROM ROLLOVERS
-- Deducts from rollover balances before main entitlements (mirrors SQL deductFromRollovers.sql)
-- ============================================================================

--[[
  calculate_rollover_change(balance, amount)

  Calculates how much to deduct from a rollover balance (simple floor at 0).
  - balance: current rollover balance (in credits)
  - amount: amount to deduct (in credits)

  Returns: amount to deduct (in credits, floor at 0)
]]
local function calculate_rollover_change(balance, amount)
  return math.min(balance, amount)
end

-- Rate-card rollovers resolve units against the owner's current-cycle tier
-- position; ordinary rollovers retain their fixed credit costs.
local function calculate_rollover_rate_change(params)
  local rollover_obj = params.rollover_obj
  local rate_card = rollover_obj.rate_card
  local requested_units = safe_number(params.requested_units)
  local available_credits = math.max(0, safe_number(params.available_credits))

  if is_nil(rate_card) then
    local credit_cost = is_nil(rollover_obj.credit_cost)
        and 1
      or safe_number(rollover_obj.credit_cost)
    if credit_cost == 0 then
      return {
        units = requested_units,
        credits = 0,
        rate_card = nil,
      }
    end

    local credits = calculate_rollover_change(
      available_credits,
      requested_units * credit_cost
    )
    return {
      units = credits / credit_cost,
      credits = credits,
      rate_card = nil,
    }
  end

  local customer_entitlement_id = params.customer_entitlement_id
  if is_nil(customer_entitlement_id)
      or not params.context.customer_entitlements[customer_entitlement_id]
  then
    error('ROLLOVER_ATTRIBUTION_OWNER_MISSING')
  end
  local current_units = get_credit_rate_current_units(
    params.context,
    customer_entitlement_id,
    rate_card
  )
  local requested_credits = math.max(
    0,
    credit_rate_cost_for_units(rate_card, current_units, requested_units)
  )
  local allowed_credits = math.min(available_credits, requested_credits)
  local funded_units = credit_rate_units_for_credit_change({
    rate_card = rate_card,
    current_units = current_units,
    requested_units = requested_units,
    allowed_credit_change = allowed_credits,
  })
  local funded_credits = credit_rate_cost_for_units(
    rate_card,
    current_units,
    funded_units
  )

  return {
    units = funded_units,
    credits = funded_credits,
    rate_card = rate_card,
  }
end

local function apply_rollover_rate_change(params)
  local change = params.change
  local rollover_obj = params.rollover_obj
  local credit_cost = is_nil(rollover_obj.credit_cost)
      and 1
    or safe_number(rollover_obj.credit_cost)

  if math.abs(change.units) <= CREDIT_RATE_EPSILON then
    return 0
  end

  if not is_nil(change.rate_card) then
    credit_cost = math.abs(change.units) > CREDIT_RATE_EPSILON
        and change.credits / change.units
      or 0
  end

  local usage_attribution_delta = nil
  if not is_nil(change.rate_card) then
    usage_attribution_delta = build_credit_rate_attribution_delta({
      rate_card = change.rate_card,
      units = change.units,
      credits = change.credits,
    })
  end

  queue_rollover_update({
    context = params.context,
    deduct_amount = change.credits,
    rollover_id = rollover_obj.id,
    entity_id = params.entity_id,
    credit_cost = credit_cost,
    value_delta = change.units,
    usage_attribution_delta = usage_attribution_delta,
  })

  update_in_memory_rollover({
    target = params.target,
    entity_id = params.entity_id,
    deduct_amount = change.credits,
  })

  if not is_nil(change.rate_card) then
    apply_credit_rate_attribution_change({
      context = params.context,
      customer_entitlement_id = params.customer_entitlement_id,
      rate_card = change.rate_card,
      units = change.units,
      credits = change.credits,
    })
  end

  return change.units
end

--[[
  deduct_from_rollovers(params)

  Deducts from rollover balances before main entitlements.
  Mirrors SQL logic in server/src/internal/balances/utils/sql/deductFromRollovers.sql

  NOTE: Unlike deduct_from_main_balance which has a single credit_cost for the whole
  operation, rollovers can have different credit_costs (each rollover may come from
  a different entitlement with different credit systems). So we must convert
  per-rollover rather than once upfront.

  Handles three scenarios:
    1. Entity-scoped with target_entity_id: Deduct from specific entity in rollover
    2. Entity-scoped without target_entity_id: Deduct from all entities in rollover
    3. Top-level balance: Deduct from rollover.balance

  params:
    context: table (context object with rollovers indexed)
    rollovers: {id: string, credit_cost: number}[] (rollovers with credit_cost)
    amount: number (amount to deduct, in feature units)
    target_entity_id: string | nil
    has_entity_scope: boolean

  Returns:
    deducted: number (total amount deducted from rollovers, in FEATURE units)
]]
local function deduct_from_rollovers(params)
  local context = params.context
  local rollovers = params.rollovers
  local amount = params.amount
  local target_entity_id = params.target_entity_id
  local has_entity_scope = params.has_entity_scope
  local logger = context.logger

  -- Early return if no rollovers or no amount
  if not rollovers or #rollovers == 0 or amount <= 0 then
    return 0
  end

  local remaining = amount -- in feature units
  local deducted = 0       -- in feature units

  logger.log("=== ROLLOVER DEDUCTION START ===")
  local ids_str = ""
  for i, r in ipairs(rollovers) do
    if i > 1 then ids_str = ids_str .. ", " end
    ids_str = ids_str .. r.id .. "(cost=" .. tostring(r.credit_cost or 1) .. ")"
  end
  logger.log("  rollovers: %s", ids_str)
  logger.log("  amount: %s, has_entity_scope: %s, target_entity_id: %s",
    tostring(amount), tostring(has_entity_scope), tostring(target_entity_id or "nil"))

  -- Loop through rollovers in order (already sorted by expires_at)
  for _, rollover_obj in ipairs(rollovers) do
    if remaining <= 0 then break end

    local rollover_id = rollover_obj.id
    local credit_cost = is_nil(rollover_obj.credit_cost)
        and 1
      or safe_number(rollover_obj.credit_cost)
    if is_nil(rollover_obj.rate_card) and credit_cost == 0 then
      -- Zero credit cost (e.g. -100% markup AI model): usage is free, leave rollovers untouched.
      logger.log("  Rollover %s credit_cost=0 - free deduction, skipping", rollover_id)
      remaining = 0
      break
    end

    local rollover_data = context.rollovers[rollover_id]
    if not rollover_data then
      logger.log("  Rollover %s not found in context", rollover_id)
    else
      -- ========================================================================
      -- CASE 1: Entity-scoped with specific target entity
      -- ========================================================================
      if has_entity_scope and not is_nil(target_entity_id) then
        local entities = rollover_data.entities or {}
        local entity_obj = entities[target_entity_id]
        local balance = entity_obj and safe_number(entity_obj.balance) or 0

        local change = calculate_rollover_rate_change({
          context = context,
          rollover_obj = rollover_obj,
          customer_entitlement_id = rollover_data.cus_ent_id,
          requested_units = remaining,
          available_credits = balance,
        })

        logger.log("  Rollover %s entity %s: balance=%s, credit_cost=%s, to_change=%s",
          rollover_id, target_entity_id, balance, credit_cost, change.credits)

        if math.abs(change.units) > CREDIT_RATE_EPSILON then
          local features = apply_rollover_rate_change({
            context = context,
            rollover_obj = rollover_obj,
            customer_entitlement_id = rollover_data.cus_ent_id,
            target = entities,
            entity_id = target_entity_id,
            change = change,
          })
          deducted = deducted + features
          remaining = remaining - features
        end

        -- ========================================================================
        -- CASE 2: Entity-scoped without target (all entities)
        -- ========================================================================
      elseif has_entity_scope then
        local entities = rollover_data.entities or {}
        local entity_keys = sorted_keys(entities)

        for _, entity_key in ipairs(entity_keys) do
          if remaining <= 0 then break end

          local entity_obj = entities[entity_key]
          local balance = entity_obj and safe_number(entity_obj.balance) or 0

          local change = calculate_rollover_rate_change({
            context = context,
            rollover_obj = rollover_obj,
            customer_entitlement_id = rollover_data.cus_ent_id,
            requested_units = remaining,
            available_credits = balance,
          })

          logger.log("  Rollover %s entity %s: balance=%s, credit_cost=%s, to_change=%s",
            rollover_id, entity_key, balance, credit_cost, change.credits)

          if math.abs(change.units) > CREDIT_RATE_EPSILON then
            local features = apply_rollover_rate_change({
              context = context,
              rollover_obj = rollover_obj,
              customer_entitlement_id = rollover_data.cus_ent_id,
              target = entities,
              entity_id = entity_key,
              change = change,
            })
            deducted = deducted + features
            remaining = remaining - features
          end
        end

        -- ========================================================================
        -- CASE 3: Top-level balance (no entity scope)
        -- ========================================================================
      else
        local balance = safe_number(rollover_data.balance)

        local change = calculate_rollover_rate_change({
          context = context,
          rollover_obj = rollover_obj,
          customer_entitlement_id = rollover_data.cus_ent_id,
          requested_units = remaining,
          available_credits = balance,
        })

        logger.log("  Rollover %s top-level: balance=%s, credit_cost=%s, to_change=%s",
          rollover_id, balance, credit_cost, change.credits)

        if math.abs(change.units) > CREDIT_RATE_EPSILON then
          local features = apply_rollover_rate_change({
            context = context,
            rollover_obj = rollover_obj,
            customer_entitlement_id = rollover_data.cus_ent_id,
            target = rollover_data,
            entity_id = nil,
            change = change,
          })
          deducted = deducted + features
          remaining = remaining - features
        end
      end
    end
  end

  logger.log("=== ROLLOVER DEDUCTION END === deducted=%s", deducted)

  return deducted
end
