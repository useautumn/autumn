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
    sorted_entitlements: array of entitlement objects
    full_customer: decoded FullCustomer object
    
  Returns: context table with:
    customer_entitlements: { [cus_ent_id]: { base_path, balance, adjustment, entities } }
    rollovers: { [rollover_id]: { base_path, balance, usage, entities } }
    pending_writes: {} (empty array to queue writes)
    logs: {} (debug logs)
    logger: { log(fmt, ...): function } (logger that appends to logs)
]]
local function init_context(params)
  local logs = {}
  
  local context = {
    customer_entitlements = {},
    rollovers = {},
    pending_writes = {},
    logs = logs,
    logger = {
      log = function(fmt, ...)
        table.insert(logs, string.format(fmt, ...))
      end
    },
  }
  
  for _, ent_obj in ipairs(params.sorted_entitlements) do
    local ent_id = ent_obj.customer_entitlement_id
    local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(params.full_customer, ent_id)
    
    if cus_ent then
      local cp_idx_0 = cp_idx - 1
      local ce_idx_0 = ce_idx - 1
      local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
      local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
      
      local ent_data = {
        base_path = base_path,
        has_entity_scope = has_entity_scope,
        adjustment = cus_ent.adjustment or 0,
        unlimited = cus_ent.unlimited,
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
  update_in_memory_customer_entitlement(params)
  
  Updates balance (and optionally adjustment) in-memory on the context object.
  
  params:
    target: table (ent_data or entities table)
    entity_id: string or nil (if entity-scoped)
    delta: number (the change amount, negative = deduction)
    alter_granted_balance: boolean (if true, also update adjustment)
]]
local function update_in_memory_customer_entitlement(params)
  local target = params.target
  local entity_id = params.entity_id
  local delta = params.delta
  local alter_granted_balance = params.alter_granted_balance

  if entity_id then
    if not target[entity_id] then
      target[entity_id] = { balance = 0, adjustment = 0 }
    end
    target[entity_id].balance = (target[entity_id].balance or 0) + delta
    if alter_granted_balance then
      target[entity_id].adjustment = (target[entity_id].adjustment or 0) + delta
    end
  else
    target.balance = (target.balance or 0) + delta
    if alter_granted_balance then
      target.adjustment = (target.adjustment or 0) + delta
    end
  end
end

--[[
  queue_balance_update(params)
  
  Queues a balance update to pending_writes and logs the action.
  
  params:
    context: table (context object)
    path: string (JSON path to the balance field, WITHOUT .balance suffix)
    delta: number (the change amount, negative = subtract from balance)
    alter_granted_balance: boolean (if true, also queue adjustment update)
]]
local function queue_balance_update(params)
  local context = params.context
  local path = params.path
  local delta = params.delta
  
  -- Queue balance write
  table.insert(context.pending_writes, { path = path .. '.balance', delta = delta })
  
  -- Queue adjustment write if needed
  if params.alter_granted_balance then
    table.insert(context.pending_writes, { path = path .. '.adjustment', delta = delta })
  end
end

--[[
  queue_rollover_update(params)
  
  Queues a rollover balance/usage update to pending_writes.
  Rollovers track both balance (decrements) and usage (increments).
  
  params:
    context: table (context object)
    path: string (JSON path to the rollover or entity, WITHOUT .balance/.usage suffix)
    deduct_amount: number (positive amount to deduct from balance and add to usage)
]]
local function queue_rollover_update(params)
  local context = params.context
  local path = params.path
  local deduct_amount = params.deduct_amount
  
  -- Queue balance decrement
  table.insert(context.pending_writes, { path = path .. '.balance', delta = -deduct_amount })
  
  -- Queue usage increment
  table.insert(context.pending_writes, { path = path .. '.usage', delta = deduct_amount })
end

--[[
  update_in_memory_rollover(params)
  
  Updates balance and usage in-memory on a rollover object.
  
  params:
    target: table (rollover_data or entities table)
    entity_id: string or nil (if entity-scoped)
    deduct_amount: number (positive amount to deduct from balance and add to usage)
]]
local function update_in_memory_rollover(params)
  local target = params.target
  local entity_id = params.entity_id
  local deduct_amount = params.deduct_amount

  if entity_id then
    if not target[entity_id] then
      target[entity_id] = { balance = 0, usage = 0 }
    end
    target[entity_id].balance = (target[entity_id].balance or 0) - deduct_amount
    target[entity_id].usage = (target[entity_id].usage or 0) + deduct_amount
  else
    target.balance = (target.balance or 0) - deduct_amount
    target.usage = (target.usage or 0) + deduct_amount
  end
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
