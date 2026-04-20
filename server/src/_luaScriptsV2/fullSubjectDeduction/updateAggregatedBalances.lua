-- ============================================================================
-- UPDATE AGGREGATED BALANCES
-- Applies main-balance (customer_entitlement) and rollover deltas from
-- entity-level mutation logs to the _aggregated field on each affected
-- shared balance hash. Rollover logs bump rollover_balance/rollover_usage;
-- customer_entitlement logs bump balance/adjustment. Both are per-scope
-- (top-level + per-entity) using the same (entity_id) attribution.
-- ============================================================================

local function update_aggregated_balances(params)
  local context = params.context
  local mutation_logs = params.mutation_logs
  local logger = context.logger

  local deltas_by_balance_key = {}

  local function ensure_agg(balance_key)
    if not deltas_by_balance_key[balance_key] then
      deltas_by_balance_key[balance_key] = {
        balance_delta = 0,
        adjustment_delta = 0,
        rollover_balance_delta = 0,
        rollover_usage_delta = 0,
        entity_deltas = {},
      }
    end
    return deltas_by_balance_key[balance_key]
  end

  local function ensure_entity(agg, entity_id)
    if not agg.entity_deltas[entity_id] then
      agg.entity_deltas[entity_id] = {
        balance_delta = 0,
        adjustment_delta = 0,
        rollover_balance_delta = 0,
        rollover_usage_delta = 0,
      }
    end
    return agg.entity_deltas[entity_id]
  end

  for _, log_entry in ipairs(type(mutation_logs) == 'table' and mutation_logs or {}) do
    local target_type = log_entry.target_type
    local is_ce = target_type == 'customer_entitlement'
    local is_rollover = target_type == 'rollover'

    if (is_ce or is_rollover)
        and not is_nil(log_entry.customer_entitlement_id)
        and log_entry.customer_entitlement_id ~= cjson.null then
      local ent_data = context.customer_entitlements[log_entry.customer_entitlement_id]
      if ent_data and ent_data.subject_balance and ent_data.subject_balance.isEntityLevel then
        local balance_key = ent_data.balance_key
        if balance_key then
          local agg = ensure_agg(balance_key)
          local balance_delta = safe_number(log_entry.balance_delta)
          local adjustment_delta = safe_number(log_entry.adjustment_delta)
          local usage_delta = safe_number(log_entry.usage_delta)

          if is_ce then
            agg.balance_delta = agg.balance_delta + balance_delta
            agg.adjustment_delta = agg.adjustment_delta + adjustment_delta
          else
            agg.rollover_balance_delta = agg.rollover_balance_delta + balance_delta
            agg.rollover_usage_delta = agg.rollover_usage_delta + usage_delta
          end

          local entity_id = log_entry.entity_id
          if not is_nil(entity_id) and entity_id ~= cjson.null then
            local ent_delta = ensure_entity(agg, entity_id)
            if is_ce then
              ent_delta.balance_delta = ent_delta.balance_delta + balance_delta
              ent_delta.adjustment_delta = ent_delta.adjustment_delta + adjustment_delta
            else
              ent_delta.rollover_balance_delta = ent_delta.rollover_balance_delta + balance_delta
              ent_delta.rollover_usage_delta = ent_delta.rollover_usage_delta + usage_delta
            end
          end
        end
      end
    end
  end

  for balance_key, deltas in pairs(deltas_by_balance_key) do
    local raw = redis.call('HGET', balance_key, '_aggregated')
    local agg_data = safe_decode(raw)
    if type(agg_data) == 'table' then
      agg_data.balance = safe_number(agg_data.balance) + deltas.balance_delta
      agg_data.adjustment = safe_number(agg_data.adjustment) + deltas.adjustment_delta
      agg_data.rollover_balance =
        safe_number(agg_data.rollover_balance) + deltas.rollover_balance_delta
      agg_data.rollover_usage =
        safe_number(agg_data.rollover_usage) + deltas.rollover_usage_delta

      if type(agg_data.entities) == 'table' then
        for entity_id, entity_delta in pairs(deltas.entity_deltas) do
          if agg_data.entities[entity_id] then
            local entity_agg = agg_data.entities[entity_id]
            entity_agg.balance =
              safe_number(entity_agg.balance) + entity_delta.balance_delta
            entity_agg.adjustment =
              safe_number(entity_agg.adjustment) + entity_delta.adjustment_delta
            entity_agg.rollover_balance =
              safe_number(entity_agg.rollover_balance) + entity_delta.rollover_balance_delta
            entity_agg.rollover_usage =
              safe_number(entity_agg.rollover_usage) + entity_delta.rollover_usage_delta
          end
        end
      end

      redis.call('HSET', balance_key, '_aggregated', cjson.encode(agg_data))
      logger.log(
        "Updated _aggregated on %s: balance_delta=%s, adjustment_delta=%s, rollover_balance_delta=%s, rollover_usage_delta=%s",
        balance_key,
        deltas.balance_delta,
        deltas.adjustment_delta,
        deltas.rollover_balance_delta,
        deltas.rollover_usage_delta
      )
    end
  end
end
