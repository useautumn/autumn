--[[
  Lua Script: Deduct from Customer Entitlements in Redis
  
  Mirrors the SQL function deduct_from_cus_ents in performDeduction.sql
  
  KEYS[1] = FullCustomer cache key
  
  ARGV[1] = JSON params:
    {
      sorted_entitlements: [{ customer_entitlement_id, credit_cost, entity_feature_id, usage_allowed, min_balance, max_balance }],
      amount_to_deduct: number | null,
      target_balance: number | null,
      target_entity_id: string | null,
      rollover_ids: string[] | null,
      cus_ent_ids: string[] | null,
      skip_additional_balance: boolean,
      alter_granted_balance: boolean,
      overage_behaviour: "cap" | "reject" | "allow",
      feature_id: string
    }
  
  Returns JSON:
    {
      updates: { [cus_ent_id]: { balance, additional_balance, adjustment, entities, deducted, additional_deducted } },
      remaining: number,
      error: string | null,
      feature_id: string | null
    }
]]

-- Note: cjson is pre-loaded as a global in Redis Lua environment (no require needed)

-- ============================================================================
-- HELPER: Find entitlement in FullCustomer by ID
-- Returns: cus_ent table, cus_product table, cus_ent_index, cus_product_index
-- ============================================================================
local function find_entitlement(full_customer, ent_id)
  if not full_customer.customer_products then return nil, nil, nil, nil end
  
  for cp_idx, cus_product in ipairs(full_customer.customer_products) do
    if cus_product.customer_entitlements then
      for ce_idx, cus_ent in ipairs(cus_product.customer_entitlements) do
        if cus_ent.id == ent_id then
          return cus_ent, cus_product, ce_idx, cp_idx
        end
      end
    end
  end
  return nil, nil, nil, nil
end

-- ============================================================================
-- MAIN SCRIPT
-- ============================================================================
local cache_key = KEYS[1]
local params = cjson.decode(ARGV[1])

-- Extract parameters
local sorted_entitlements = params.sorted_entitlements or {}
local amount_to_deduct = params.amount_to_deduct
local target_balance = params.target_balance
local target_entity_id = params.target_entity_id
local rollover_ids = params.rollover_ids
local skip_additional_balance = params.skip_additional_balance or false
local alter_granted_balance = params.alter_granted_balance or false
local overage_behaviour = params.overage_behaviour or 'cap'
local feature_id = params.feature_id

-- Compute overage_behavior_is_allow once
local overage_behavior_is_allow = alter_granted_balance or overage_behaviour == 'allow'

-- Get FullCustomer from Redis (use '.' for legacy path to get root directly)
local full_customer_json = redis.call('JSON.GET', cache_key, '.')
if not full_customer_json then
  return cjson.encode({ error = 'CUSTOMER_NOT_FOUND', updates = {}, remaining = 0 })
end

local full_customer = cjson.decode(full_customer_json)

-- Debug: check if customer_products exists
if not full_customer.customer_products then
  return cjson.encode({ 
    error = 'NO_CUSTOMER_PRODUCTS', 
    updates = {}, 
    remaining = 0,
    debug = { has_customer_products = false }
  })
end

-- Initialize remaining_amount (target_balance logic can be added later if needed)
local remaining_amount = amount_to_deduct or 0

-- Track updates and pending operations
local updates = {}
local pending_sets = {} -- { { path, value }, ... } for JSON.SET
local logs = {} -- Debug logs

-- Helper: Round number to avoid floating-point precision issues
-- Uses string.format to get clean decimal representation
local function round_number(num)
  if num == nil then return 0 end
  -- Format to 10 decimal places, then convert back to number to strip trailing zeros
  return tonumber(string.format("%.10g", num))
end

table.insert(logs, "=== LUA DEDUCTION START ===")
table.insert(logs, "amount_to_deduct: " .. tostring(amount_to_deduct))
table.insert(logs, "remaining_amount: " .. tostring(remaining_amount))
table.insert(logs, "num_entitlements: " .. tostring(#sorted_entitlements))
table.insert(logs, "overage_behaviour: " .. tostring(overage_behaviour))
table.insert(logs, "overage_behavior_is_allow: " .. tostring(overage_behavior_is_allow))

-- ============================================================================
-- PASS 1: Deduct all entitlements down to 0 (or add if negative)
-- ============================================================================
table.insert(logs, "=== PASS 1 START ===")

for ent_idx, ent_obj in ipairs(sorted_entitlements) do
  table.insert(logs, "PASS1 ent[" .. ent_idx .. "] remaining_amount=" .. tostring(remaining_amount))
  if remaining_amount == 0 then 
    table.insert(logs, "PASS1 breaking - remaining_amount is 0")
    break 
  end
  
  -- Extract entitlement properties
  local ent_id = ent_obj.customer_entitlement_id
  local credit_cost = ent_obj.credit_cost or 1
  local min_balance = ent_obj.min_balance
  local max_balance = ent_obj.max_balance
  local usage_allowed = ent_obj.usage_allowed
  -- Check for both nil AND cjson.null (JSON null decodes to cjson.null, not Lua nil)
  local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
  
  table.insert(logs, "PASS1 ent_id=" .. tostring(ent_id) .. " credit_cost=" .. tostring(credit_cost) .. " usage_allowed=" .. tostring(usage_allowed))
  
  -- Find entitlement in FullCustomer (returns 1-based indices)
  local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
  
  table.insert(logs, "PASS1 found=" .. tostring(cus_ent ~= nil) .. " cp_idx=" .. tostring(cp_idx) .. " ce_idx=" .. tostring(ce_idx))
  
  -- Only process if entitlement found (Lua 5.1 compatible - no goto)
  if cus_ent then
    -- Convert to 0-based indices for JSONPath
    local cp_idx_0 = cp_idx - 1
    local ce_idx_0 = ce_idx - 1
    local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
    
    -- Get current state from FullCustomer
    local current_balance = cus_ent.balance or 0
    local current_additional_balance = cus_ent.additional_balance or 0
    local current_adjustment = cus_ent.adjustment or 0
    
    table.insert(logs, "PASS1 current_balance=" .. tostring(current_balance) .. " current_adjustment=" .. tostring(current_adjustment))
    
    -- Track original entities (preserve null if not entity-scoped)
    local original_entities = cus_ent.entities
    local entities_was_null = (original_entities == nil or original_entities == cjson.null)
    local current_entities = safe_table(original_entities)
    
    -- TODO: Step 1 - Deduct from rollovers (to be implemented)
    -- TODO: Step 2 - Deduct from additional_balance (to be implemented)
    
    local additional_deducted = 0
    local new_additional_balance = current_additional_balance
    local new_adjustment = current_adjustment
    
    -- Step 3: Deduct from main balance (Pass 1: allow_negative = false)
    local deducted, new_balance, new_entities
    deducted, new_balance, new_entities, new_adjustment = deduct_from_main_balance({
      current_balance = current_balance,
      current_entities = current_entities,
      current_adjustment = new_adjustment,
      amount_to_deduct = remaining_amount,
      credit_cost = credit_cost,
      allow_negative = false,
      has_entity_scope = has_entity_scope,
      target_entity_id = target_entity_id,
      min_balance = min_balance,
      max_balance = max_balance,
      alter_granted_balance = alter_granted_balance,
      overage_behavior_is_allow = overage_behavior_is_allow
    })
    
    table.insert(logs, "PASS1 deduct_from_main_balance returned: deducted=" .. tostring(deducted) .. " new_balance=" .. tostring(new_balance))
    
    -- Queue operations if any deduction occurred
    if deducted ~= 0 or additional_deducted ~= 0 then
      table.insert(logs, "PASS1 deduction occurred, updating in-memory and queueing")
      
      -- Update the in-memory cus_ent for Pass 2 to read correct values (no rounding yet)
      cus_ent.balance = new_balance
      cus_ent.adjustment = new_adjustment
      if has_entity_scope then
        cus_ent.entities = new_entities
      end
      
      -- Queue numeric updates (rounding happens at the end)
      table.insert(pending_sets, { base_path .. '.balance', new_balance })
      table.insert(pending_sets, { base_path .. '.additional_balance', new_additional_balance })
      table.insert(pending_sets, { base_path .. '.adjustment', new_adjustment })
      
      -- Only update entities if entity-scoped
      local entities_to_store = nil
      if has_entity_scope then
        -- For entities, we need to encode as JSON string for JSON.SET
        table.insert(pending_sets, { base_path .. '.entities', cjson.encode(new_entities) })
        entities_to_store = new_entities
      end
      -- If not entity-scoped, don't touch entities at all (preserves null or existing value)
      
      -- Track in updates for return value (rounding happens at the end)
      updates[ent_id] = {
        balance = new_balance,
        additional_balance = new_additional_balance,
        adjustment = new_adjustment,
        entities = entities_to_store,
        deducted = deducted + additional_deducted,
        additional_deducted = additional_deducted
      }
      
      local old_remaining = remaining_amount
      remaining_amount = remaining_amount - (deducted / credit_cost)
      table.insert(logs, "PASS1 remaining: " .. tostring(old_remaining) .. " - (" .. tostring(deducted) .. "/" .. tostring(credit_cost) .. ") = " .. tostring(remaining_amount))
    else
      table.insert(logs, "PASS1 no deduction (deducted=" .. tostring(deducted) .. " additional_deducted=" .. tostring(additional_deducted) .. ")")
    end
  end
end

table.insert(logs, "=== PASS 1 END === remaining_amount=" .. tostring(remaining_amount))

-- ============================================================================
-- PASS 2: Allow usage_allowed=true entitlements to go negative
-- ============================================================================
table.insert(logs, "=== PASS 2 START === remaining_amount=" .. tostring(remaining_amount))

if remaining_amount > 0 then
  for ent_idx, ent_obj in ipairs(sorted_entitlements) do
    table.insert(logs, "PASS2 ent[" .. ent_idx .. "] remaining_amount=" .. tostring(remaining_amount))
    if remaining_amount == 0 then 
      table.insert(logs, "PASS2 breaking - remaining_amount is 0")
      break 
    end
    
    -- Extract entitlement properties
    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost or 1
    local min_balance = ent_obj.min_balance
    local max_balance = ent_obj.max_balance
    local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
    
    -- Check usage_allowed (also check for cjson.null)
    local usage_allowed = ent_obj.usage_allowed
    if usage_allowed == cjson.null then usage_allowed = false end
    usage_allowed = usage_allowed or overage_behavior_is_allow
    
    table.insert(logs, "PASS2 ent_id=" .. tostring(ent_id) .. " usage_allowed=" .. tostring(usage_allowed))
    
    -- Skip entitlements without usage_allowed
    if not usage_allowed then
      table.insert(logs, "PASS2 skipping - usage_allowed is false")
      -- continue (Lua 5.1 compatible - just don't enter the if block)
    else
      -- Find entitlement in FullCustomer (returns 1-based indices)
      local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
      
      if cus_ent then
        -- Convert to 0-based indices for JSONPath
        local cp_idx_0 = cp_idx - 1
        local ce_idx_0 = ce_idx - 1
        local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
        
        -- Get current state from FullCustomer (may have been updated in PASS 1)
        local current_balance = cus_ent.balance or 0
        local current_additional_balance = cus_ent.additional_balance or 0
        local current_adjustment = cus_ent.adjustment or 0
        
        -- Track original entities
        local original_entities = cus_ent.entities
        local entities_was_null = (original_entities == nil or original_entities == cjson.null)
        local current_entities = safe_table(original_entities)
        
        -- Note: additional_balance was already processed in Pass 1, so we don't deduct from it here
        local new_additional_balance = current_additional_balance
        
        -- Perform deduction (Pass 2: allow_negative = true)
        local deducted, new_balance, new_entities, new_adjustment
        deducted, new_balance, new_entities, new_adjustment = deduct_from_main_balance({
          current_balance = current_balance,
          current_entities = current_entities,
          current_adjustment = current_adjustment,
          amount_to_deduct = remaining_amount,
          credit_cost = credit_cost,
          allow_negative = true,
          has_entity_scope = has_entity_scope,
          target_entity_id = target_entity_id,
          min_balance = min_balance,
          max_balance = max_balance,
          alter_granted_balance = alter_granted_balance,
          overage_behavior_is_allow = overage_behavior_is_allow
        })
        
        table.insert(logs, "PASS2 current_balance=" .. tostring(current_balance) .. " deducted=" .. tostring(deducted) .. " new_balance=" .. tostring(new_balance))
        
        -- Queue operations if deduction occurred
        if deducted ~= 0 then
          -- Update the in-memory cus_ent for subsequent iterations (no rounding yet)
          cus_ent.balance = new_balance
          cus_ent.adjustment = new_adjustment
          if has_entity_scope then
            cus_ent.entities = new_entities
          end
          
          -- Queue numeric updates (rounding happens at the end)
          table.insert(pending_sets, { base_path .. '.balance', new_balance })
          table.insert(pending_sets, { base_path .. '.adjustment', new_adjustment })
          
          -- Only update entities if entity-scoped
          local entities_to_store = nil
          if has_entity_scope then
            table.insert(pending_sets, { base_path .. '.entities', cjson.encode(new_entities) })
            entities_to_store = new_entities
          end
          
          -- Update or create entry in updates (rounding happens at the end)
          if updates[ent_id] then
            -- Update existing entry (entitlement was updated in both passes)
            updates[ent_id].balance = new_balance
            updates[ent_id].additional_balance = new_additional_balance
            updates[ent_id].adjustment = new_adjustment
            updates[ent_id].entities = entities_to_store
            updates[ent_id].deducted = updates[ent_id].deducted + deducted
            -- additional_deducted stays the same (only from Pass 1)
          else
            -- Create new entry (entitlement only updated in Pass 2)
            updates[ent_id] = {
              balance = new_balance,
              additional_balance = new_additional_balance,
              adjustment = new_adjustment,
              entities = entities_to_store,
              deducted = deducted,
              additional_deducted = 0
            }
          end
          
          local old_remaining = remaining_amount
          remaining_amount = remaining_amount - (deducted / credit_cost)
          table.insert(logs, "PASS2 remaining: " .. tostring(old_remaining) .. " - (" .. tostring(deducted) .. "/" .. tostring(credit_cost) .. ") = " .. tostring(remaining_amount))
        else
          table.insert(logs, "PASS2 no deduction (deducted=" .. tostring(deducted) .. ")")
        end
      end
    end
  end
else
  table.insert(logs, "PASS2 skipped - remaining_amount <= 0")
end

table.insert(logs, "=== PASS 2 END === remaining_amount=" .. tostring(remaining_amount))

-- Check overage behaviour
if remaining_amount > 0 and overage_behaviour == 'reject' then
  return cjson.encode({
    error = 'INSUFFICIENT_BALANCE',
    feature_id = feature_id,
    remaining = remaining_amount,
    updates = {}
  })
end

-- Apply all pending JSON.SET operations with rounding for numeric values
for _, op in ipairs(pending_sets) do
  local path = op[1]
  local value = op[2]
  
  if type(value) == 'string' then
    -- Already JSON encoded (entities)
    redis.call('JSON.SET', cache_key, path, value)
  else
    -- Number - round to avoid floating-point precision issues
    local rounded_value = round_number(value)
    redis.call('JSON.SET', cache_key, path, rounded_value)
  end
  table.insert(logs, "JSON.SET " .. path .. " = " .. tostring(value))
end

-- Round all numeric values in updates before returning
for ent_id, update in pairs(updates) do
  update.balance = round_number(update.balance)
  update.additional_balance = round_number(update.additional_balance)
  update.adjustment = round_number(update.adjustment)
  update.deducted = round_number(update.deducted)
  update.additional_deducted = round_number(update.additional_deducted)
end

table.insert(logs, "=== LUA DEDUCTION END ===")

-- Return result with rounded remaining
return cjson.encode({
  updates = updates,
  remaining = round_number(remaining_amount),
  error = cjson.null,
  logs = logs
})

