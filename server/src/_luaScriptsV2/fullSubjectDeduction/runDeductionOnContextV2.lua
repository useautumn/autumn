-- ============================================================================
-- RUN DEDUCTION ON CONTEXT
-- Shared deduction core for operating against an initialized in-memory context.
-- ============================================================================

--[[
  round_to_precision(num, decimals)

  Rounds a number to avoid floating point drift in remaining amounts.
]]
local function round_to_precision(num, decimals)
  local mult = 10 ^ (decimals or 10)
  return math.floor(num * mult + 0.5) / mult
end

--[[
  process_deduction_pass(params)

  Runs one main-balance deduction pass over all customer_entitlement deductions.

  Returns:
    {
      updates = table,
      remaining_amount = number,
    }
]]
local function process_deduction_pass(params)
  local context = params.context
  local customer_entitlement_deductions =
    params.customer_entitlement_deductions or {}
  local target_entity_id = params.target_entity_id
  local spend_limit_by_feature_id = params.spend_limit_by_feature_id
  local usage_based_cus_ent_ids_by_feature_id = params.usage_based_cus_ent_ids_by_feature_id
  local alter_granted_balance = params.alter_granted_balance or false
  local overage_behavior_is_allow = params.overage_behavior_is_allow or false
  local enforce_spend_limit_gate = params.enforce_spend_limit_gate or false
  local bypass_usage_windows = params.bypass_usage_windows or false
  local pass_number = params.pass_number
  local skip_if_not_usage_allowed = params.skip_if_not_usage_allowed
  local updates = params.updates or {}
  local remaining_amount = params.remaining_amount or 0
  local pass_name = "PASS" .. pass_number
  local logger = context.logger

  logger.log("=== %s START ===", pass_name)

  for _, ent_obj in ipairs(customer_entitlement_deductions) do
    if remaining_amount == 0 then
      break
    end

    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost
    local rate_card = ent_obj.rate_card
    local ent_feature_id = ent_obj.feature_id
    if credit_cost == cjson.null or credit_cost == nil or credit_cost == 0 then
      credit_cost = 1
    end

    local available_overage = nil
    if pass_number == 2
        and remaining_amount > 0
        and enforce_spend_limit_gate
        and not is_nil(ent_feature_id)
    then
      local spend_limit = nil
      if not is_nil(spend_limit_by_feature_id) then
        spend_limit = spend_limit_by_feature_id[ent_feature_id]
      end

      local usage_based_cus_ent_ids = nil
      if not is_nil(usage_based_cus_ent_ids_by_feature_id) then
        usage_based_cus_ent_ids = usage_based_cus_ent_ids_by_feature_id[ent_feature_id]
      end

      available_overage = get_available_overage_from_spend_limit({
        context = context,
        spend_limit = spend_limit,
        usage_based_cus_ent_ids = usage_based_cus_ent_ids,
        target_entity_id = target_entity_id,
      })
    end

    local usage_allowed = ent_obj.usage_allowed
    if usage_allowed == cjson.null then
      usage_allowed = false
    end
    usage_allowed = usage_allowed or overage_behavior_is_allow

    local should_process = not skip_if_not_usage_allowed or usage_allowed
    local skip_reason = "usage_allowed=false"
    if not context.customer_entitlements[ent_id] then
      should_process = false
      skip_reason = "not in context"
    end

    -- Usage-window gate, mirroring the spend-limit overage gate above: cap
    -- this ent's deductible amount by the remaining window headroom (metered
    -- limits cap every ent in tracked units; balance limits cap ents of the
    -- capped feature, converted via THIS ent's credit_cost). A fully blocked
    -- ent is skipped rather than breaking the loop -- a balance-dim cap only
    -- binds its own feature's pools, so other ents may be unconstrained.
    local ent_amount = remaining_amount
    if should_process and remaining_amount > 0 and not bypass_usage_windows then
      local available_from_usage_windows = get_available_from_usage_windows({
        context = context,
        ent_feature_id = ent_feature_id,
        credit_cost = credit_cost,
        rate_card = rate_card,
        current_units = get_credit_rate_current_units(context, ent_id, rate_card),
        requested_units = remaining_amount,
      })
      if not is_nil(available_from_usage_windows)
          and available_from_usage_windows < ent_amount then
        ent_amount = available_from_usage_windows
      end
      if ent_amount == 0 then
        should_process = false
        skip_reason = "usage window headroom exhausted"
      end
    end

    if not should_process then
      logger.log("%s skipping %s - %s", pass_name, ent_id, skip_reason)
    else
      local current_rate_units = get_credit_rate_current_units(
        context,
        ent_id,
        rate_card
      )
      local effective_credit_cost = credit_cost
      local requested_credit_change = nil
      if not is_nil(rate_card) then
        requested_credit_change = credit_rate_cost_for_units(
          rate_card,
          current_rate_units,
          ent_amount
        )
        if math.abs(ent_amount) > CREDIT_RATE_EPSILON then
          effective_credit_cost = requested_credit_change / ent_amount
        end
      end

      local mutation_log_start = #(context.mutation_logs or {})
      local deducted = 0
      if is_nil(rate_card)
          or math.abs(requested_credit_change or 0) > CREDIT_RATE_EPSILON
      then
        deducted = deduct_from_main_balance({
          context = context,
          ent_id = ent_id,
          target_entity_id = target_entity_id,
          amount = ent_amount,
          credit_cost = effective_credit_cost,
          pass_number = pass_number,
          available_overage = available_overage,
          min_balance = ent_obj.min_balance,
          max_balance = ent_obj.max_balance,
          alter_granted_balance = alter_granted_balance,
          overage_behavior_is_allow = overage_behavior_is_allow,
          log_prefix = pass_name,
        })
      end

      local deducted_units = deducted / credit_cost
      if not is_nil(rate_card) then
        deducted_units = credit_rate_units_for_credit_change({
          rate_card = rate_card,
          current_units = current_rate_units,
          requested_units = ent_amount,
          allowed_credit_change = deducted,
        })

        if math.abs(deducted_units) > CREDIT_RATE_EPSILON then
          apply_credit_rate_attribution_change({
            context = context,
            customer_entitlement_id = ent_id,
            rate_card = rate_card,
            units = deducted_units,
            credits = deducted,
          })

          if math.abs(deducted) <= CREDIT_RATE_EPSILON then
            append_mutation_log({
              context = context,
              target_type = 'customer_entitlement',
              customer_entitlement_id = ent_id,
              credit_cost = 0,
              balance_delta = 0,
              adjustment_delta = 0,
              usage_delta = 0,
              value_delta = deducted_units,
              usage_attribution_delta = build_credit_rate_attribution_delta({
                rate_card = rate_card,
                units = deducted_units,
                credits = deducted,
              }),
            })
          else
            local log_units_before = current_rate_units
            local remaining_log_units = deducted_units
            for log_index = mutation_log_start + 1, #context.mutation_logs do
              local mutation_log = context.mutation_logs[log_index]
              if mutation_log.customer_entitlement_id == ent_id then
                local log_credit_change = -safe_number(mutation_log.balance_delta)
                local log_units = credit_rate_units_for_credit_change({
                  rate_card = rate_card,
                  current_units = log_units_before,
                  requested_units = remaining_log_units,
                  allowed_credit_change = log_credit_change,
                })
                mutation_log.value_delta = log_units
                mutation_log.credit_cost = math.abs(log_units) > CREDIT_RATE_EPSILON
                    and log_credit_change / log_units
                  or 0
                mutation_log.usage_attribution_delta = build_credit_rate_attribution_delta({
                  rate_card = rate_card,
                  units = log_units,
                  credits = log_credit_change,
                })
                log_units_before = log_units_before + log_units
                remaining_log_units = remaining_log_units - log_units
              end
            end
          end
        end
      end

      remaining_amount = remaining_amount - deducted_units

      -- Settle the gate: record what this ent actually drained against every
      -- applicable window limit so the next ent sees the reduced headroom.
      consume_usage_window_headroom({
        context = context,
        ent_feature_id = ent_feature_id,
        credit_cost = credit_cost,
        units = deducted_units,
        credits = deducted,
      })

      if deducted ~= 0 or deducted_units ~= 0 then
        if not updates[ent_id] then
          updates[ent_id] = { deducted = 0, additional_deducted = 0 }
        end
        updates[ent_id].deducted = (updates[ent_id].deducted or 0) + deducted
      end

      logger.log("%s ent %s deducted=%s remaining=%s", pass_name, ent_id, deducted, remaining_amount)
    end
  end

  logger.log("=== %s END === remaining=%s", pass_name, remaining_amount)

  return {
    updates = updates,
    remaining_amount = remaining_amount,
  }
end

--[[
  process_rollover_deduction(params)

  Runs rollover deduction before the main balance passes.
]]
local function process_rollover_deduction(params)
  local context = params.context
  local customer_entitlement_deductions =
    params.customer_entitlement_deductions or {}
  local rollovers = params.rollovers
  local target_entity_id = params.target_entity_id
  local remaining_amount = params.remaining_amount or 0
  local bypass_usage_windows = params.bypass_usage_windows or false
  local logger = context.logger

  if is_nil(rollovers) or #rollovers == 0 or remaining_amount <= 0 then
    return 0
  end

  -- Metered window limits count tracked units regardless of funding source,
  -- so they gate the rollover phase too. Balance limits do not (ent_feature_id
  -- = nil): rollover drains stay outside credit-pool caps, matching how spend
  -- limits ignore them.
  local rollover_amount = remaining_amount
  if not bypass_usage_windows then
    local available_from_usage_windows = get_available_from_usage_windows({
      context = context,
      ent_feature_id = nil,
      credit_cost = 1,
    })
    if not is_nil(available_from_usage_windows)
        and available_from_usage_windows < rollover_amount then
      rollover_amount = available_from_usage_windows
    end
  end

  if rollover_amount <= 0 then
    logger.log("Rollover deduction skipped - usage window headroom exhausted")
    return 0
  end

  local first_ent = customer_entitlement_deductions[1]
  local has_entity_scope = false
  if first_ent then
    has_entity_scope = first_ent.entity_feature_id ~= nil and first_ent.entity_feature_id ~= cjson.null
  end

  local rollover_deducted = deduct_from_rollovers({
    context = context,
    rollovers = rollovers,
    amount = rollover_amount,
    target_entity_id = target_entity_id,
    has_entity_scope = has_entity_scope,
  })

  consume_usage_window_headroom({
    context = context,
    ent_feature_id = nil,
    credit_cost = 1,
    units = rollover_deducted,
  })

  logger.log("Rollover deduction: deducted=%s, remaining=%s", rollover_deducted, remaining_amount - rollover_deducted)

  return rollover_deducted
end

--[[
  run_deduction_on_context(params)

  Executes rollover deduction and the two-pass main balance deduction against an
  existing context, then builds final updates from that context.

  params:
    context: initialized context
    customer_entitlement_deductions: deduction inputs
    rollovers: rollover inputs | nil
    amount_to_deduct: number | nil
    target_balance: number | nil
    target_entity_id: string | nil
    alter_granted_balance: boolean
    overage_behaviour: string

  Returns:
    {
      updates: table,
      rollover_updates: table,
      remaining_amount: number,
    }
]]
local function run_deduction_on_context(params)
  local context = params.context
  local customer_entitlement_deductions =
    params.customer_entitlement_deductions or {}
  local rollovers = params.rollovers
  local target_entity_id = params.target_entity_id
  local spend_limit_by_feature_id = params.spend_limit_by_feature_id
  local usage_based_cus_ent_ids_by_feature_id = params.usage_based_cus_ent_ids_by_feature_id
  local alter_granted_balance = params.alter_granted_balance or false
  local overage_behaviour = params.overage_behaviour or 'cap'
  -- 'overflow' removes balance floors like 'allow', but keeps monetary spend
  -- limits authoritative and punches through usage-window caps.
  local overage_behavior_is_allow = alter_granted_balance
      or overage_behaviour == 'allow'
      or overage_behaviour == 'overflow'
  local enforce_spend_limit_gate = overage_behaviour == 'overflow'
      or not (alter_granted_balance or overage_behaviour == 'allow')
  local bypass_usage_windows = overage_behaviour == 'overflow'
  local updates = {}

  -- Unlimited entries arrive sorted first and act as an infinite sink; the
  -- rollover and additional-balance steps are intentionally bypassed for them
  -- (remaining hits 0 before those steps run).
  local first_ent = customer_entitlement_deductions[1]
  local first_unlimited = first_ent and first_ent.unlimited
  if first_unlimited == cjson.null or first_unlimited == nil then
    first_unlimited = false
  end
  local unlimited_ent_data = nil
  local unlimited_credit_cost = 1
  if first_unlimited then
    unlimited_ent_data =
      context.customer_entitlements[first_ent.customer_entitlement_id]
    local first_credit_cost = first_ent.credit_cost
    if first_credit_cost ~= cjson.null
        and first_credit_cost ~= nil
        and first_credit_cost ~= 0
    then
      unlimited_credit_cost = first_credit_cost
    end
  end

  local set_balance_to_target = function(set_params)
    local old_balance = set_params.old_balance
    local to_change = old_balance - params.target_balance
    if to_change == 0 then
      return 0
    end

    queue_customer_entitlement_mutation({
      context = context,
      balance_delta = -to_change,
      adjustment_delta = 0,
      customer_entitlement_id = set_params.ent_id,
      entity_id = set_params.entity_id,
      credit_cost = unlimited_credit_cost,
      value_delta = to_change / unlimited_credit_cost,
    })

    update_in_memory_customer_entitlement_mutation({
      target = set_params.target,
      entity_id = set_params.entity_id,
      balance_delta = -to_change,
      adjustment_delta = 0,
    })

    return to_change
  end

  local remaining_amount
  if unlimited_ent_data and not is_nil(params.target_balance) then
    local ent_id = first_ent.customer_entitlement_id
    local total_change = 0

    if unlimited_ent_data.has_entity_scope and not is_nil(target_entity_id) then
      local entities = unlimited_ent_data.entities or {}
      local entity_obj = entities[target_entity_id]
      total_change = set_balance_to_target({
        ent_id = ent_id,
        entity_id = target_entity_id,
        target = entities,
        old_balance = entity_obj and safe_number(entity_obj.balance) or 0,
      })
    elseif unlimited_ent_data.has_entity_scope then
      -- Aggregate semantics (matches the finite set_usage path): with no target
      -- entity, target_balance is the TOTAL across entities. Convert it to a
      -- delta and let the sink distribute it sequentially — never sync each
      -- entity to the target.
      local entities = unlimited_ent_data.entities or {}
      local old_total = 0
      for _, entity_key in ipairs(sorted_keys(entities)) do
        local entity_obj = entities[entity_key]
        old_total = old_total + (entity_obj and safe_number(entity_obj.balance) or 0)
      end
      local aggregate_amount = round_to_precision(
        (old_total - params.target_balance) / unlimited_credit_cost,
        10
      )
      total_change = deduct_from_main_balance({
        context = context,
        ent_id = ent_id,
        target_entity_id = target_entity_id,
        amount = aggregate_amount,
        credit_cost = unlimited_credit_cost,
        pass_number = 2,
        available_overage = nil,
        min_balance = nil,
        max_balance = nil,
        alter_granted_balance = alter_granted_balance,
        overage_behavior_is_allow = overage_behavior_is_allow,
        log_prefix = "UNLIMITED",
      })
    else
      total_change = set_balance_to_target({
        ent_id = ent_id,
        entity_id = nil,
        target = unlimited_ent_data,
        old_balance = safe_number(unlimited_ent_data.balance),
      })
    end

    if total_change ~= 0 then
      updates[ent_id] = { deducted = total_change, additional_deducted = 0 }
    end

    context.logger.log(
      "UNLIMITED target_balance: ent %s target=%s deducted=%s",
      ent_id, params.target_balance, total_change
    )
    remaining_amount = 0
  elseif unlimited_ent_data then
    local ent_id = first_ent.customer_entitlement_id
    remaining_amount = params.amount_to_deduct or 0

    local deducted = deduct_from_main_balance({
      context = context,
      ent_id = ent_id,
      target_entity_id = target_entity_id,
      amount = remaining_amount,
      credit_cost = unlimited_credit_cost,
      pass_number = 2,
      available_overage = nil,
      min_balance = nil,
      max_balance = nil,
      alter_granted_balance = alter_granted_balance,
      overage_behavior_is_allow = overage_behavior_is_allow,
      log_prefix = "UNLIMITED",
    })

    if deducted ~= 0 then
      updates[ent_id] = { deducted = deducted, additional_deducted = 0 }
    end

    remaining_amount = round_to_precision(
      remaining_amount - deducted / unlimited_credit_cost,
      10
    )
  elseif not is_nil(params.target_balance) then
    local current_total = get_total_balance({
      context = context,
      sorted_entitlements = customer_entitlement_deductions,
      target_entity_id = target_entity_id,
    })
    remaining_amount = current_total - params.target_balance
  else
    remaining_amount = params.amount_to_deduct or 0
  end

  local is_refund = remaining_amount < 0

  if not alter_granted_balance then
    local rollover_deducted = process_rollover_deduction({
      context = context,
      customer_entitlement_deductions = customer_entitlement_deductions,
      rollovers = rollovers,
      target_entity_id = target_entity_id,
      remaining_amount = remaining_amount,
      bypass_usage_windows = bypass_usage_windows,
    })
    remaining_amount = remaining_amount - rollover_deducted
  end

  local pass_one_result = process_deduction_pass({
    context = context,
    customer_entitlement_deductions = customer_entitlement_deductions,
    target_entity_id = target_entity_id,
    spend_limit_by_feature_id = spend_limit_by_feature_id,
    usage_based_cus_ent_ids_by_feature_id = usage_based_cus_ent_ids_by_feature_id,
    alter_granted_balance = alter_granted_balance,
    overage_behavior_is_allow = overage_behavior_is_allow,
    enforce_spend_limit_gate = enforce_spend_limit_gate,
    bypass_usage_windows = bypass_usage_windows,
    pass_number = 1,
    skip_if_not_usage_allowed = false,
    updates = updates,
    remaining_amount = remaining_amount,
  })
  updates = pass_one_result.updates
  remaining_amount = pass_one_result.remaining_amount

  if remaining_amount ~= 0 then
    local pass_two_result = process_deduction_pass({
      context = context,
      customer_entitlement_deductions = customer_entitlement_deductions,
      target_entity_id = target_entity_id,
      spend_limit_by_feature_id = spend_limit_by_feature_id,
      usage_based_cus_ent_ids_by_feature_id = usage_based_cus_ent_ids_by_feature_id,
      alter_granted_balance = alter_granted_balance,
      overage_behavior_is_allow = overage_behavior_is_allow,
      enforce_spend_limit_gate = enforce_spend_limit_gate,
      bypass_usage_windows = bypass_usage_windows,
      pass_number = 2,
      skip_if_not_usage_allowed = not is_refund,
      updates = updates,
      remaining_amount = remaining_amount,
    })
    updates = pass_two_result.updates
    remaining_amount = pass_two_result.remaining_amount
  end

  remaining_amount = round_to_precision(remaining_amount, 10)

  for ent_id, update in pairs(updates) do
    local ent_data = context.customer_entitlements[ent_id]
    if ent_data then
      if ent_data.has_entity_scope then
        update.entities = ent_data.entities
        update.balance = 0
      else
        update.balance = ent_data.balance
      end

      update.adjustment = ent_data.adjustment or 0
      update.additional_balance = 0
      update.usage_attribution = ent_data.subject_balance.usage_attribution or {}
    end
  end

  -- Rollover-only rate changes need a zero-deduction entitlement update so
  -- TypeScript receives the changed attribution.
  for _, ent_id in ipairs(context.pending_writes or {}) do
    if is_nil(updates[ent_id]) then
      local ent_data = context.customer_entitlements[ent_id]
      if ent_data then
        updates[ent_id] = {
          balance = ent_data.has_entity_scope and 0 or ent_data.balance,
          additional_balance = safe_number(
            ent_data.subject_balance.additional_balance
          ),
          adjustment = ent_data.adjustment or 0,
          entities = ent_data.entities or {},
          usage_attribution = ent_data.subject_balance.usage_attribution or {},
          deducted = 0,
          additional_deducted = 0,
        }
      end
    end
  end

  local rollover_updates = {}
  if not is_nil(rollovers) and #rollovers > 0 then
    for rollover_id, rollover_data in pairs(context.rollovers) do
      for _, rollover in ipairs(rollovers) do
        if rollover.id == rollover_id then
          rollover_updates[rollover_id] = {
            cus_ent_id = rollover_data.cus_ent_id,
            balance = rollover_data.balance,
            usage = rollover_data.usage,
            entities = rollover_data.entities,
          }
          break
        end
      end
    end
  end

  return {
    updates = updates,
    rollover_updates = rollover_updates,
    remaining_amount = remaining_amount,
  }
end
