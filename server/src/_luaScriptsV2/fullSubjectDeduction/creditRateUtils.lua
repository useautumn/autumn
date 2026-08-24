-- Graduated credit-rate math. Usage boundaries are raw feature units; costs
-- are credits per feature_amount units.

local CREDIT_RATE_EPSILON = 1e-10

local function build_credit_rate_attribution_delta(params)
  return {
    units = params.units,
    credits = params.credits,
    rate_card = params.rate_card,
  }
end

local function credit_rate_cost_at_usage(rate_card, usage)
  local bounded_usage = math.max(0, safe_number(usage))
  local feature_amount = safe_number(rate_card.feature_amount)
  if feature_amount <= 0 then
    error('INVALID_CREDIT_RATE_CARD_FEATURE_AMOUNT')
  end

  if rate_card.tier_behavior ~= 'graduated' then
    return bounded_usage
      * safe_number(rate_card.credit_amount)
      / feature_amount
  end

  local total_cost = 0
  local previous_boundary = 0
  local tiers = safe_table(rate_card.tiers)

  for index, tier in ipairs(tiers) do
    local is_infinite = tier.to == 'inf'
    local boundary = is_infinite and bounded_usage or safe_number(tier.to)
    local tier_units = math.max(
      0,
      math.min(bounded_usage, boundary) - previous_boundary
    )
    total_cost = total_cost
      + tier_units * safe_number(tier.credit_amount) / feature_amount

    if bounded_usage <= boundary or is_infinite then
      return total_cost
    end
    previous_boundary = boundary
  end

  error('INVALID_CREDIT_RATE_CARD_FINAL_TIER')
end

local function credit_rate_cost_for_units(rate_card, current_units, units)
  local before_cost = credit_rate_cost_at_usage(rate_card, current_units)
  local after_units = math.max(0, safe_number(current_units) + safe_number(units))
  return credit_rate_cost_at_usage(rate_card, after_units) - before_cost
end

local function credit_rate_units_for_credit_change(params)
  local rate_card = params.rate_card
  local current_units = math.max(0, safe_number(params.current_units))
  local requested_units = safe_number(params.requested_units)
  local allowed_credits = math.abs(safe_number(params.allowed_credit_change))
  local remaining_units = math.abs(requested_units)
  local direction = requested_units < 0 and -1 or 1

  if remaining_units <= CREDIT_RATE_EPSILON then
    return 0
  end

  if direction < 0 then
    remaining_units = math.min(remaining_units, current_units)
  end

  local feature_amount = safe_number(rate_card.feature_amount)
  if feature_amount <= 0 then
    error('INVALID_CREDIT_RATE_CARD_FEATURE_AMOUNT')
  end

  local tiers = rate_card.tier_behavior == 'graduated'
      and safe_table(rate_card.tiers)
    or {{ to = 'inf', credit_amount = rate_card.credit_amount }}
  local position = current_units
  local applied_units = 0

  if direction > 0 then
    local previous_boundary = 0
    for _, tier in ipairs(tiers) do
      if remaining_units <= CREDIT_RATE_EPSILON then
        break
      end

      local is_infinite = tier.to == 'inf'
      local boundary = is_infinite and (position + remaining_units) or safe_number(tier.to)
      if position < boundary then
        local segment_start = math.max(position, previous_boundary)
        local segment_units = math.min(
          remaining_units,
          math.max(0, boundary - segment_start)
        )
        local unit_cost = safe_number(tier.credit_amount) / feature_amount
        local units_to_apply = segment_units

        if unit_cost > CREDIT_RATE_EPSILON then
          units_to_apply = math.min(segment_units, allowed_credits / unit_cost)
          allowed_credits = math.max(
            0,
            allowed_credits - units_to_apply * unit_cost
          )
        end

        position = position + units_to_apply
        applied_units = applied_units + units_to_apply
        remaining_units = remaining_units - units_to_apply

        if units_to_apply + CREDIT_RATE_EPSILON < segment_units then
          break
        end
      end

      if not is_infinite then
        previous_boundary = boundary
      end
    end
  else
    for index = #tiers, 1, -1 do
      if remaining_units <= CREDIT_RATE_EPSILON then
        break
      end

      local tier = tiers[index]
      local lower_boundary = index == 1
          and 0
        or safe_number(tiers[index - 1].to)
      local upper_boundary = tier.to == 'inf'
          and position
        or safe_number(tier.to)

      if position > lower_boundary and position <= upper_boundary then
        local segment_units = math.min(
          remaining_units,
          position - lower_boundary
        )
        local unit_cost = safe_number(tier.credit_amount) / feature_amount
        local units_to_apply = segment_units

        if unit_cost > CREDIT_RATE_EPSILON then
          units_to_apply = math.min(segment_units, allowed_credits / unit_cost)
          allowed_credits = math.max(
            0,
            allowed_credits - units_to_apply * unit_cost
          )
        end

        position = position - units_to_apply
        applied_units = applied_units + units_to_apply
        remaining_units = remaining_units - units_to_apply

        if units_to_apply + CREDIT_RATE_EPSILON < segment_units then
          break
        end
      end
    end
  end

  return direction * applied_units
end
