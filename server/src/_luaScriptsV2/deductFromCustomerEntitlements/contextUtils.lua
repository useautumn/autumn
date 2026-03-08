-- ============================================================================
-- CONTEXT UTILITIES
-- Functions for managing in-memory context during deductions
-- ============================================================================

--[[
  init_context(params)
  
  Initializes context object with current balances for all customer_entitlements
  and builds a rollover index for fast lookups.
  Reads from Redis once upfront to avoid multiple reads during passes.
  
  params:
    cache_key: string
    customer_entitlement_ids: array of customer_entitlement IDs
    full_customer: decoded FullCustomer object
    
  Returns: context table with:
    customer_entitlements: { [cus_ent_id]: { base_path, balance, adjustment, entities } }
    rollovers: { [rollover_id]: { base_path, cus_ent_id, balance, usage, entities } }
    mutation_logs: {} (ordered mutation items for receipts and replay)
    pending_writes: {} (empty array to queue writes)
    logs: {} (debug logs)
    logger: { log(fmt, ...): function } (logger that appends to logs)
]]
local function init_context(params)
  local logs = {}
  
  local context = {
    customer_entitlements = {},
    rollovers = {},
    mutation_logs = {},
    pending_writes = {},
    logs = logs,
    logger = {
      log = function(fmt, ...)
        table.insert(logs, string.format(fmt, ...))
      end
    },
  }
  
  for _, ent_id in ipairs(params.customer_entitlement_ids or {}) do
    local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(params.full_customer, ent_id)
    
    if cus_ent then
      local base_path
      local is_loose = (cp_idx == nil)  -- Loose entitlement if no customer_product index
      
      if is_loose then
        -- Loose entitlement: path is $.extra_customer_entitlements[idx]
        local ece_idx_0 = ce_idx - 1
        base_path = '$.extra_customer_entitlements[' .. ece_idx_0 .. ']'
      else
        -- Product entitlement: path is $.customer_products[cp_idx].customer_entitlements[ce_idx]
        local cp_idx_0 = cp_idx - 1
        local ce_idx_0 = ce_idx - 1
        base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
      end
      
      local entitlement = cus_ent.entitlement
      local has_entity_scope = not is_nil(entitlement)
        and not is_nil(entitlement.entity_feature_id)
      
      local ent_data = {
        base_path = base_path,
        has_entity_scope = has_entity_scope,
        adjustment = cus_ent.adjustment or 0,
        unlimited = cus_ent.unlimited,
        is_loose = is_loose,
      }
      
      if has_entity_scope then
        ent_data.balance = 0  -- Not used for entity-scoped
        ent_data.entities = read_current_entities(params.cache_key, base_path)
      else
        ent_data.balance = read_current_balance(params.cache_key, base_path)
        ent_data.entities = nil
      end
      
      context.customer_entitlements[ent_id] = ent_data
      
      -- Build rollover index for this customer_entitlement
      local cus_ent_rollovers = cus_ent.rollovers
      if cus_ent_rollovers and type(cus_ent_rollovers) == 'table' then
        for r_idx, rollover in ipairs(cus_ent_rollovers) do
          if rollover and rollover.id then
            local r_idx_0 = r_idx - 1
            local rollover_path = base_path .. '.rollovers[' .. r_idx_0 .. ']'
            
            -- Read fresh rollover data from Redis
            local rollover_data = read_rollover_data(params.cache_key, rollover_path)
            
            if rollover_data then
              context.rollovers[rollover.id] = {
                base_path = rollover_path,
                cus_ent_id = ent_id,
                balance = rollover_data.balance,
                usage = rollover_data.usage,
                entities = rollover_data.entities,
              }
            end
          end
        end
      end
    end
  end
  
  return context
end

--[[
  append_mutation_log(params)

  Appends one ordered mutation log entry for later receipt persistence and replay.
]]
local function append_mutation_log(params)
  local context = params.context
  table.insert(context.mutation_logs, {
    target_type = params.target_type,
    customer_entitlement_id = params.customer_entitlement_id or cjson.null,
    rollover_id = params.rollover_id or cjson.null,
    entity_id = params.entity_id or cjson.null,
    credit_cost = params.credit_cost or 1,
    balance_delta = params.balance_delta or 0,
    adjustment_delta = params.adjustment_delta or 0,
    usage_delta = params.usage_delta or 0,
    value_delta = params.value_delta or 0,
  })
end

--[[
  update_in_memory_customer_entitlement_mutation(params)

  Applies an arbitrary balance/adjustment mutation to an in-memory
  customer_entitlement target.
]]
local function update_in_memory_customer_entitlement_mutation(params)
  local target = params.target
  local entity_id = params.entity_id
  local balance_delta = params.balance_delta
  local adjustment_delta = params.adjustment_delta

  if balance_delta == nil then
    balance_delta = params.delta or 0
  end

  if adjustment_delta == nil then
    adjustment_delta = params.alter_granted_balance and balance_delta or 0
  end

  if entity_id then
    if not target[entity_id] then
      target[entity_id] = { balance = 0, adjustment = 0 }
    end
    target[entity_id].balance = (target[entity_id].balance or 0) + balance_delta
    target[entity_id].adjustment = (target[entity_id].adjustment or 0) + adjustment_delta
    return
  end

  target.balance = (target.balance or 0) + balance_delta
  target.adjustment = (target.adjustment or 0) + adjustment_delta
end

--[[
  update_in_memory_rollover_mutation(params)

  Applies an arbitrary balance/usage mutation to an in-memory rollover target.
]]
local function update_in_memory_rollover_mutation(params)
  local target = params.target
  local entity_id = params.entity_id
  local balance_delta = params.balance_delta or 0
  local usage_delta = params.usage_delta or 0

  if entity_id then
    if not target[entity_id] then
      target[entity_id] = { balance = 0, usage = 0 }
    end
    target[entity_id].balance = (target[entity_id].balance or 0) + balance_delta
    target[entity_id].usage = (target[entity_id].usage or 0) + usage_delta
    return
  end

  target.balance = (target.balance or 0) + balance_delta
  target.usage = (target.usage or 0) + usage_delta
end

--[[
  queue_customer_entitlement_mutation(params)

  Queues a generic customer_entitlement mutation into pending_writes and
  mutation_logs.
]]
local function queue_customer_entitlement_mutation(params)
  local context = params.context
  local path = params.path
  local balance_delta = params.balance_delta
  local adjustment_delta = params.adjustment_delta

  if balance_delta == nil then
    balance_delta = params.delta or 0
  end

  if adjustment_delta == nil then
    adjustment_delta = params.alter_granted_balance and balance_delta or 0
  end

  if balance_delta ~= 0 then
    table.insert(context.pending_writes, { path = path .. '.balance', delta = balance_delta })
  end

  if adjustment_delta ~= 0 then
    table.insert(context.pending_writes, { path = path .. '.adjustment', delta = adjustment_delta })
  end

  append_mutation_log({
    context = context,
    target_type = 'customer_entitlement',
    customer_entitlement_id = params.customer_entitlement_id,
    rollover_id = nil,
    entity_id = params.entity_id,
    credit_cost = params.credit_cost or 1,
    balance_delta = balance_delta,
    adjustment_delta = adjustment_delta,
    usage_delta = 0,
    value_delta = params.value_delta or 0,
  })
end

--[[
  queue_rollover_mutation(params)

  Queues a generic rollover mutation into pending_writes and mutation_logs.
]]
local function queue_rollover_mutation(params)
  local context = params.context
  local path = params.path
  local balance_delta = params.balance_delta or 0
  local usage_delta = params.usage_delta or 0
  local rollover_id = params.rollover_id

  if balance_delta ~= 0 then
    table.insert(context.pending_writes, { path = path .. '.balance', delta = balance_delta })
  end

  if usage_delta ~= 0 then
    table.insert(context.pending_writes, { path = path .. '.usage', delta = usage_delta })
  end

  local rollover_data = context.rollovers[rollover_id]
  append_mutation_log({
    context = context,
    target_type = 'rollover',
    customer_entitlement_id = rollover_data and rollover_data.cus_ent_id or nil,
    rollover_id = rollover_id,
    entity_id = params.entity_id,
    credit_cost = params.credit_cost or 1,
    balance_delta = balance_delta,
    adjustment_delta = 0,
    usage_delta = usage_delta,
    value_delta = params.value_delta or 0,
  })
end

--[[
  queue_rollover_update(params)

  Queues a rollover balance/usage update to pending_writes.
  Rollovers track both balance (decrements) and usage (increments).
]]
local function queue_rollover_update(params)
  local deduct_amount = params.deduct_amount

  queue_rollover_mutation({
    context = params.context,
    path = params.path,
    rollover_id = params.rollover_id,
    entity_id = params.entity_id,
    balance_delta = -deduct_amount,
    usage_delta = deduct_amount,
    value_delta = params.value_delta or 0,
  })
end

--[[
  update_in_memory_rollover(params)

  Backwards-compatible wrapper for main deduction paths.
]]
local function update_in_memory_rollover(params)
  update_in_memory_rollover_mutation({
    target = params.target,
    entity_id = params.entity_id,
    balance_delta = -(params.deduct_amount or 0),
    usage_delta = params.deduct_amount or 0,
  })
end

--[[
  apply_pending_writes(cache_key, context)
  
  Applies all queued writes to Redis.
  Called only after validation passes.
]]
local function apply_pending_writes(cache_key, context)
  for _, write in ipairs(context.pending_writes) do
    redis.call('JSON.NUMINCRBY', cache_key, write.path, write.delta)
  end
end
