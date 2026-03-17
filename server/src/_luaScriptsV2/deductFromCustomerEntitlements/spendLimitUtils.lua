-- ============================================================================
-- SPEND LIMIT UTILITIES
-- Computes atomic available overage from current in-memory/live entitlement data
-- ============================================================================

local function build_ent_data_from_full_customer(params)
  local full_customer = params.full_customer
  local cus_ent_id = params.cus_ent_id

  if is_nil(full_customer) or is_nil(cus_ent_id) then
    return nil
  end

  local cus_ent = find_entitlement(full_customer, cus_ent_id)
  if is_nil(cus_ent) then
    return nil
  end

  local entitlement = cus_ent.entitlement
  local has_entity_scope = not is_nil(entitlement)
      and not is_nil(entitlement.entity_feature_id)

  return {
    has_entity_scope = has_entity_scope,
    balance = safe_number(cus_ent.balance),
    entities = cus_ent.entities or {},
  }
end

local function get_available_overage_from_spend_limit(params)
  local context = params.context
  local spend_limit = params.spend_limit
  local usage_based_cus_ent_ids = params.usage_based_cus_ent_ids or {}
  local target_entity_id = params.target_entity_id

  if is_nil(spend_limit) or is_nil(spend_limit.overage_limit) then
    return nil
  end

  local total_overage = 0

  for _, cus_ent_id in ipairs(usage_based_cus_ent_ids) do
    local ent_data = context.customer_entitlements[cus_ent_id]

    if is_nil(ent_data) then
      ent_data = build_ent_data_from_full_customer({
        full_customer = context.full_customer,
        cus_ent_id = cus_ent_id,
      })
    end

    if ent_data then
      if ent_data.has_entity_scope then
        if not is_nil(target_entity_id) then
          local entity_data = ent_data.entities and ent_data.entities[target_entity_id]
          local balance = entity_data and safe_number(entity_data.balance) or 0
          total_overage = total_overage + math.max(-balance, 0)
        else
          for _, entity_data in pairs(ent_data.entities or {}) do
            local balance = safe_number(entity_data.balance)
            total_overage = total_overage + math.max(-balance, 0)
          end
        end
      else
        local balance = safe_number(ent_data.balance)
        total_overage = total_overage + math.max(-balance, 0)
      end
    end
  end

  return math.max(0, safe_number(spend_limit.overage_limit) - total_overage)
end
