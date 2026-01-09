--[[
  Lua Script: Deduct from Customer Entitlements in Redis
  
  Uses JSON.NUMINCRBY for atomic incremental updates.
  Reads CURRENT balance from Redis before each calculation to avoid stale reads.
  
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
-- HELPER: Safe table getter (handles cjson.null)
-- ============================================================================
local function safe_table(val)
  if val == nil or val == cjson.null or type(val) ~= 'table' then
    return {}
  end
  return val
end

-- ============================================================================
-- HELPER: Safe number getter
-- ============================================================================
local function safe_number(val)
  if val == nil or val == cjson.null then
    return 0
  end
  return tonumber(val) or 0
end

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
-- HELPER: Build entity path (consistent across all operations)
-- ============================================================================
local function build_entity_path(base_path, entity_id)
  -- Use bracket notation for entity access since entity IDs are object keys
  return base_path .. '["entities"]["' .. entity_id .. '"]'
end

-- ============================================================================
-- HELPER: Read current balance from Redis (fresh read, not from snapshot)
-- ============================================================================
local function read_current_balance(cache_key, base_path)
  local result = redis.call('JSON.GET', cache_key, base_path .. '.balance')
  if not result or result == cjson.null then
    return 0
  end
  -- JSON.GET returns a JSON string, need to decode
  local decoded = cjson.decode(result)
  -- JSONPath returns an array of matches, extract the first element
  if type(decoded) == 'table' and decoded[1] ~= nil then
    decoded = decoded[1]
  end
  return safe_number(decoded)
end

-- ============================================================================
-- HELPER: Read current entity balance from Redis (fresh read)
-- ============================================================================
local function read_current_entity_balance(cache_key, base_path, entity_id)
  -- Use dot notation for entity access
  local entity_path = base_path .. '.entities.' .. entity_id
  local result = redis.call('JSON.GET', cache_key, entity_path)
  
  if not result or result == cjson.null then
    return nil -- Entity doesn't exist
  end
  
  local decoded = cjson.decode(result)
  
  -- JSONPath returns an array of matches, extract the first element
  if type(decoded) == 'table' and decoded[1] ~= nil then
    decoded = decoded[1]
  end
  
  if type(decoded) ~= 'table' then
    return nil
  end
  
  return {
    balance = safe_number(decoded.balance),
    adjustment = safe_number(decoded.adjustment)
  }
end

-- ============================================================================
-- HELPER: Read all entity balances from Redis (fresh read)
-- ============================================================================
local function read_current_entities(cache_key, base_path)
  local entities_path = base_path .. '.entities'
  local result = redis.call('JSON.GET', cache_key, entities_path)
  if not result or result == cjson.null then
    return {}
  end
  local decoded = cjson.decode(result)
  -- JSONPath returns an array of matches, extract the first element
  if type(decoded) == 'table' and decoded[1] ~= nil and type(decoded[1]) == 'table' then
    -- Check if this looks like a JSONPath array wrapper (first element is an object with entity keys)
    -- vs an actual entity object (first element would be a number or have 'balance' field directly)
    if decoded.balance == nil and decoded.adjustment == nil then
      decoded = decoded[1]
    end
  end
  if type(decoded) ~= 'table' then
    return {}
  end
  return decoded
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

-- Check if customer exists (just check the key exists)
local key_exists = redis.call('EXISTS', cache_key)
if key_exists == 0 then
  return cjson.encode({ error = 'CUSTOMER_NOT_FOUND', updates = {}, remaining = 0 })
end

-- Get FullCustomer structure (for finding entitlement indices only)
local full_customer_json = redis.call('JSON.GET', cache_key, '.')
if not full_customer_json then
  return cjson.encode({ error = 'CUSTOMER_NOT_FOUND', updates = {}, remaining = 0 })
end

local full_customer = cjson.decode(full_customer_json)

if not full_customer.customer_products then
  return cjson.encode({ 
    error = 'NO_CUSTOMER_PRODUCTS', 
    updates = {}, 
    remaining = 0
  })
end

-- Initialize remaining_amount
local remaining_amount = amount_to_deduct or 0

-- Track updates for return value
local updates = {}
local logs = {} -- Debug logs

-- Determine if this is a refund (negative amount)
local is_refund = remaining_amount < 0

table.insert(logs, "=== LUA DEDUCTION START (FRESH READS) ===")
table.insert(logs, "amount_to_deduct: " .. tostring(amount_to_deduct))
table.insert(logs, "is_refund: " .. tostring(is_refund))
table.insert(logs, "target_entity_id: " .. tostring(target_entity_id))
table.insert(logs, "overage_behaviour: " .. tostring(overage_behaviour))

-- ============================================================================
-- PRE-CHECK FOR REJECT MODE: Calculate total available balance before any writes
-- This ensures we don't make partial deductions that we'd need to roll back
-- ============================================================================
if overage_behaviour == 'reject' and remaining_amount > 0 then
  local total_available = 0
  
  table.insert(logs, "=== PRE-CHECK START ===")
  
  for ent_idx, ent_obj in ipairs(sorted_entitlements) do
    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost or 1
    local min_balance = ent_obj.min_balance
    local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
    local usage_allowed = ent_obj.usage_allowed
    if usage_allowed == cjson.null then usage_allowed = false end
    usage_allowed = usage_allowed or overage_behavior_is_allow
    
    table.insert(logs, "PRE-CHECK ent=" .. tostring(ent_id) .. " has_entity_scope=" .. tostring(has_entity_scope) .. " target_entity_id=" .. tostring(target_entity_id))
    
    local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
    
    table.insert(logs, "PRE-CHECK found cus_ent=" .. tostring(cus_ent ~= nil) .. " cp_idx=" .. tostring(cp_idx) .. " ce_idx=" .. tostring(ce_idx))
    
    if cus_ent then
      local cp_idx_0 = cp_idx - 1
      local ce_idx_0 = ce_idx - 1
      local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
      
      table.insert(logs, "PRE-CHECK base_path=" .. base_path)
      
      if has_entity_scope and target_entity_id then
        local entity_data = read_current_entity_balance(cache_key, base_path, target_entity_id)
        local entity_balance = entity_data and entity_data.balance or 0
        
        -- Pass 1 availability: down to 0
        local pass1_available = math.max(0, entity_balance)
        total_available = total_available + (pass1_available / credit_cost)
        
        -- Pass 2 availability: if usage_allowed, can go to min_balance
        if usage_allowed then
          local floor = min_balance or 0
          -- We can deduct down to floor (which could be negative)
          -- Additional capacity from current balance down to floor
          local pass2_available = math.max(0, 0 - floor) -- From 0 down to floor
          total_available = total_available + (pass2_available / credit_cost)
        end
        
      elseif has_entity_scope and not target_entity_id then
        local current_entities = read_current_entities(cache_key, base_path)
        for entity_key, entity_data in pairs(current_entities) do
          local entity_balance = safe_number(entity_data.balance)
          local pass1_available = math.max(0, entity_balance)
          total_available = total_available + (pass1_available / credit_cost)
          
          if usage_allowed then
            local floor = min_balance or 0
            local pass2_available = math.max(0, 0 - floor)
            total_available = total_available + (pass2_available / credit_cost)
          end
        end
        
      else
        local current_balance = read_current_balance(cache_key, base_path)
        local pass1_available = math.max(0, current_balance)
        total_available = total_available + (pass1_available / credit_cost)
        
        if usage_allowed then
          local floor = min_balance or 0
          local pass2_available = math.max(0, 0 - floor)
          total_available = total_available + (pass2_available / credit_cost)
        end
      end
    end
  end
  
  table.insert(logs, "PRE-CHECK total_available=" .. tostring(total_available) .. " required=" .. tostring(remaining_amount))
  
  if total_available < remaining_amount then
    table.insert(logs, "PRE-CHECK FAILED - insufficient balance")
    return cjson.encode({
      error = 'INSUFFICIENT_BALANCE',
      feature_id = feature_id,
      remaining = remaining_amount - total_available,
      updates = {},
      logs = logs
    })
  end
  
  table.insert(logs, "PRE-CHECK PASSED")
end

-- ============================================================================
-- REFUND HANDLING: For negative amounts, two-phase approach:
--   PASS 1: Recover overage - increment negative balance towards 0 (usage_allowed entitlements only)
--   PASS 2: Restore prepaid - increment balance up to max_balance (all entitlements)
-- 
-- In V2, overage is stored as NEGATIVE balance (not in additional_balance).
-- When tracking 180 with 150 prepaid, the PPU entitlement ends with balance=-30.
-- Refund should first recover this negative balance back to 0.
-- ============================================================================
if is_refund then
  table.insert(logs, "=== REFUND START ===")
  
  -- For refunds, remaining_amount is negative. We want to:
  -- 1. First recover overage (negative balance) back to 0 for usage_allowed entitlements
  -- 2. Then restore prepaid balance up to max_balance for all entitlements
  -- remaining_amount will approach 0 as we process refunds.
  
  -- ============================================================================
  -- REFUND PASS 1: Recover overage (negative balance → 0)
  -- Only entitlements with usage_allowed=true can have negative balance (overage)
  -- ============================================================================
  table.insert(logs, "=== REFUND PASS 1: recover overage (negative balance) ===")
  
  for ent_idx, ent_obj in ipairs(sorted_entitlements) do
    if remaining_amount >= 0 then break end
    
    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost or 1
    local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
    local usage_allowed = ent_obj.usage_allowed
    if usage_allowed == cjson.null then usage_allowed = false end
    usage_allowed = usage_allowed or overage_behavior_is_allow
    
    -- Only process entitlements that allow overage (can have negative balance)
    if not usage_allowed then
      table.insert(logs, "REFUND PASS1 skipping " .. ent_id .. " - no overage allowed")
    else
      local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
      
      if cus_ent then
        local cp_idx_0 = cp_idx - 1
        local ce_idx_0 = ce_idx - 1
        local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
        
        local overage_recovered = 0
        
        if has_entity_scope and target_entity_id then
          -- ENTITY-SCOPED with specific target entity
          local entity_data = read_current_entity_balance(cache_key, base_path, target_entity_id)
          local entity_balance = entity_data and entity_data.balance or 0
          
          table.insert(logs, "REFUND PASS1 entity " .. target_entity_id .. " balance=" .. tostring(entity_balance))
          
          -- Only recover if balance is negative (overage was used)
          if entity_balance < 0 then
            -- remaining_amount is negative, -remaining_amount is positive (amount to refund)
            -- Can only increment up to 0 (recover overage)
            local to_recover = math.min(-remaining_amount * credit_cost, -entity_balance)
            
            if to_recover > 0 then
              local entity_path = build_entity_path(base_path, target_entity_id)
              redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.balance', to_recover)
              table.insert(logs, "JSON.NUMINCRBY " .. entity_path .. '.balance ' .. tostring(to_recover))
              
              overage_recovered = to_recover
              remaining_amount = remaining_amount + (to_recover / credit_cost)
            end
          end
          
        elseif has_entity_scope and not target_entity_id then
          -- ENTITY-SCOPED without target (all entities)
          local current_entities = read_current_entities(cache_key, base_path)
          
          local entity_keys = {}
          for k in pairs(current_entities) do
            table.insert(entity_keys, k)
          end
          table.sort(entity_keys)
          
          for _, entity_key in ipairs(entity_keys) do
            if remaining_amount >= 0 then break end
            
            local entity_data = read_current_entity_balance(cache_key, base_path, entity_key)
            local entity_balance = entity_data and entity_data.balance or 0
            
            if entity_balance < 0 then
              local to_recover = math.min(-remaining_amount * credit_cost, -entity_balance)
              
              if to_recover > 0 then
                local entity_path = build_entity_path(base_path, entity_key)
                redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.balance', to_recover)
                
                overage_recovered = overage_recovered + to_recover
                remaining_amount = remaining_amount + (to_recover / credit_cost)
              end
            end
          end
          
        else
          -- TOP-LEVEL balance (no entity scope)
          local current_balance = read_current_balance(cache_key, base_path)
          
          table.insert(logs, "REFUND PASS1 ent " .. ent_id .. " balance=" .. tostring(current_balance))
          
          -- Only recover if balance is negative (overage was used)
          if current_balance < 0 then
            -- remaining_amount is negative, -remaining_amount is positive (amount to refund)
            -- Can only increment up to 0 (recover overage)
            local to_recover = math.min(-remaining_amount * credit_cost, -current_balance)
            
            table.insert(logs, "REFUND PASS1 to_recover=" .. tostring(to_recover))
            
            if to_recover > 0 then
              redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.balance', to_recover)
              table.insert(logs, "JSON.NUMINCRBY " .. base_path .. '.balance ' .. tostring(to_recover))
              
              overage_recovered = to_recover
              remaining_amount = remaining_amount + (to_recover / credit_cost)
            end
          end
        end
        
        -- Track overage recovery (stored as negative deducted for consistency)
        if overage_recovered > 0 then
          if not updates[ent_id] then
            updates[ent_id] = { deducted = 0, additional_deducted = 0 }
          end
          updates[ent_id].deducted = (updates[ent_id].deducted or 0) - overage_recovered
        end
        
        table.insert(logs, "REFUND PASS1 ent " .. ent_id .. " overage_recovered=" .. tostring(overage_recovered) .. " remaining=" .. tostring(remaining_amount))
      end
    end
  end
  
  table.insert(logs, "=== REFUND PASS 1 END === remaining=" .. tostring(remaining_amount))
  
  -- ============================================================================
  -- REFUND PASS 2: Restore prepaid (increment balance up to max_balance)
  -- All entitlements can receive prepaid refunds
  -- ============================================================================
  table.insert(logs, "=== REFUND PASS 2: restore prepaid (balance up to max_balance) ===")
  
  for ent_idx, ent_obj in ipairs(sorted_entitlements) do
    if remaining_amount >= 0 then break end
    
    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost or 1
    local max_balance = ent_obj.max_balance
    local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
    
    local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
    
    if cus_ent then
      local cp_idx_0 = cp_idx - 1
      local ce_idx_0 = ce_idx - 1
      local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
      
      local refunded = 0
      
      if has_entity_scope and target_entity_id then
        -- ENTITY-SCOPED with specific target entity
        local entity_data = read_current_entity_balance(cache_key, base_path, target_entity_id)
        local entity_balance = entity_data and entity_data.balance or 0
        
        table.insert(logs, "REFUND PASS2 entity " .. target_entity_id .. " FRESH balance=" .. tostring(entity_balance))
        
        -- Calculate how much we can add (remaining_amount is negative, so -remaining_amount is positive)
        local to_add = -remaining_amount * credit_cost
        
        -- Cap at max_balance if set (unless overage_behavior is 'allow')
        if max_balance and not overage_behavior_is_allow then
          local room = max_balance - entity_balance
          if room > 0 then
            to_add = math.min(to_add, room)
          else
            to_add = 0
          end
        end
        
        if to_add > 0 then
          local entity_path = build_entity_path(base_path, target_entity_id)
          redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.balance', to_add)
          table.insert(logs, "JSON.NUMINCRBY " .. entity_path .. '.balance ' .. tostring(to_add))
          
          if alter_granted_balance then
            redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.adjustment', to_add)
          end
          
          refunded = to_add
          remaining_amount = remaining_amount + (to_add / credit_cost)
        end
        
      elseif has_entity_scope and not target_entity_id then
        -- ENTITY-SCOPED without target (all entities)
        local current_entities = read_current_entities(cache_key, base_path)
        
        local entity_keys = {}
        for k in pairs(current_entities) do
          table.insert(entity_keys, k)
        end
        table.sort(entity_keys)
        
        for _, entity_key in ipairs(entity_keys) do
          if remaining_amount >= 0 then break end
          
          local entity_data = read_current_entity_balance(cache_key, base_path, entity_key)
          local entity_balance = entity_data and entity_data.balance or 0
          
          local to_add = -remaining_amount * credit_cost
          
          if max_balance and not overage_behavior_is_allow then
            local room = max_balance - entity_balance
            if room > 0 then
              to_add = math.min(to_add, room)
            else
              to_add = 0
            end
          end
          
          if to_add > 0 then
            local entity_path = build_entity_path(base_path, entity_key)
            redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.balance', to_add)
            
            if alter_granted_balance then
              redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.adjustment', to_add)
            end
            
            refunded = refunded + to_add
            remaining_amount = remaining_amount + (to_add / credit_cost)
          end
        end
        
      else
        -- TOP-LEVEL balance (no entity scope)
        local current_balance = read_current_balance(cache_key, base_path)
        
        table.insert(logs, "REFUND PASS2 top-level FRESH balance=" .. tostring(current_balance))
        table.insert(logs, "REFUND PASS2 remaining_amount=" .. tostring(remaining_amount) .. " credit_cost=" .. tostring(credit_cost))
        
        local to_add = -remaining_amount * credit_cost
        table.insert(logs, "REFUND PASS2 initial to_add=" .. tostring(to_add))
        
        if max_balance and not overage_behavior_is_allow then
          local room = max_balance - current_balance
          table.insert(logs, "REFUND PASS2 max_balance=" .. tostring(max_balance) .. " room=" .. tostring(room))
          if room > 0 then
            to_add = math.min(to_add, room)
            table.insert(logs, "REFUND PASS2 capped to_add=" .. tostring(to_add))
          else
            to_add = 0
            table.insert(logs, "REFUND PASS2 no room, to_add=0")
          end
        else
          table.insert(logs, "REFUND PASS2 no cap applied (max_balance=" .. tostring(max_balance) .. " overage_is_allow=" .. tostring(overage_behavior_is_allow) .. ")")
        end
        
        if to_add > 0 then
          redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.balance', to_add)
          table.insert(logs, "JSON.NUMINCRBY " .. base_path .. '.balance ' .. tostring(to_add))
          
          if alter_granted_balance then
            redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.adjustment', to_add)
          end
          
          refunded = to_add
          remaining_amount = remaining_amount + (to_add / credit_cost)
        end
      end
      
      -- Track refund (stored as negative deducted for consistency)
      if refunded > 0 then
        if not updates[ent_id] then
          updates[ent_id] = { deducted = 0, additional_deducted = 0 }
        end
        updates[ent_id].deducted = (updates[ent_id].deducted or 0) - refunded
      end
      
      table.insert(logs, "REFUND PASS2 ent " .. ent_id .. " refunded=" .. tostring(refunded) .. " remaining=" .. tostring(remaining_amount))
    end
  end
  
  table.insert(logs, "=== REFUND PASS 2 END === remaining=" .. tostring(remaining_amount))
  table.insert(logs, "=== REFUND END === remaining=" .. tostring(remaining_amount))
end

-- Only run deduction passes if NOT a refund
if not is_refund then

-- ============================================================================
-- PASS 1: Deduct down to 0 (no negative balances)
-- ============================================================================
table.insert(logs, "=== PASS 1 START ===")

for ent_idx, ent_obj in ipairs(sorted_entitlements) do
  if remaining_amount == 0 then break end
  
  local ent_id = ent_obj.customer_entitlement_id
  local credit_cost = ent_obj.credit_cost or 1
  local min_balance = ent_obj.min_balance
  local max_balance = ent_obj.max_balance
  local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
  
  -- Find entitlement to get JSONPath indices
  local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
  
  if cus_ent then
    local cp_idx_0 = cp_idx - 1
    local ce_idx_0 = ce_idx - 1
    local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
    
    local deducted = 0
    
    if has_entity_scope and target_entity_id then
      -- ENTITY-SCOPED with specific target entity
      -- Read FRESH balance from Redis
      local entity_data = read_current_entity_balance(cache_key, base_path, target_entity_id)
      local entity_balance = entity_data and entity_data.balance or 0
      
      table.insert(logs, "PASS1 entity " .. target_entity_id .. " FRESH balance=" .. tostring(entity_balance))
      
      -- Calculate how much we can deduct (floor at 0 in pass 1)
      local to_deduct = math.min(entity_balance, remaining_amount * credit_cost)
      to_deduct = math.max(0, to_deduct) -- Can't deduct from negative balance
      
      if to_deduct > 0 then
        -- Apply atomic decrement
        local entity_path = build_entity_path(base_path, target_entity_id)
        redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.balance', -to_deduct)
        table.insert(logs, "JSON.NUMINCRBY " .. entity_path .. '.balance ' .. tostring(-to_deduct))
        
        if alter_granted_balance then
          redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.adjustment', -to_deduct)
        end
        
        deducted = to_deduct
        remaining_amount = remaining_amount - (to_deduct / credit_cost)
      end
      
    elseif has_entity_scope and not target_entity_id then
      -- ENTITY-SCOPED without target (all entities)
      local current_entities = read_current_entities(cache_key, base_path)
      
      -- Sort entity keys for consistency
      local entity_keys = {}
      for k in pairs(current_entities) do
        table.insert(entity_keys, k)
      end
      table.sort(entity_keys)
      
      for _, entity_key in ipairs(entity_keys) do
        if remaining_amount == 0 then break end
        
        -- Read FRESH balance for this entity
        local entity_data = read_current_entity_balance(cache_key, base_path, entity_key)
        local entity_balance = entity_data and entity_data.balance or 0
        
        local to_deduct = math.min(entity_balance, remaining_amount * credit_cost)
        to_deduct = math.max(0, to_deduct)
        
        if to_deduct > 0 then
          local entity_path = build_entity_path(base_path, entity_key)
          redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.balance', -to_deduct)
          
          if alter_granted_balance then
            redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.adjustment', -to_deduct)
          end
          
          deducted = deducted + to_deduct
          remaining_amount = remaining_amount - (to_deduct / credit_cost)
        end
      end
      
    else
      -- TOP-LEVEL balance (no entity scope)
      local current_balance = read_current_balance(cache_key, base_path)
      
      table.insert(logs, "PASS1 top-level FRESH balance=" .. tostring(current_balance))
      
      local to_deduct = math.min(current_balance, remaining_amount * credit_cost)
      to_deduct = math.max(0, to_deduct)
      
      if to_deduct > 0 then
        redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.balance', -to_deduct)
        table.insert(logs, "JSON.NUMINCRBY " .. base_path .. '.balance ' .. tostring(-to_deduct))
        
        if alter_granted_balance then
          redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.adjustment', -to_deduct)
        end
        
        deducted = to_deduct
        remaining_amount = remaining_amount - (to_deduct / credit_cost)
      end
    end
    
    -- Track deduction
    if deducted > 0 then
      if not updates[ent_id] then
        updates[ent_id] = { deducted = 0, additional_deducted = 0 }
      end
      updates[ent_id].deducted = (updates[ent_id].deducted or 0) + deducted
    end
    
    table.insert(logs, "PASS1 ent " .. ent_id .. " deducted=" .. tostring(deducted) .. " remaining=" .. tostring(remaining_amount))
  end
end

table.insert(logs, "=== PASS 1 END === remaining=" .. tostring(remaining_amount))

-- ============================================================================
-- PASS 2: Allow usage_allowed=true entitlements to go negative
-- ============================================================================
table.insert(logs, "=== PASS 2 START ===")

if remaining_amount > 0 then
  for ent_idx, ent_obj in ipairs(sorted_entitlements) do
    if remaining_amount == 0 then break end
    
    local ent_id = ent_obj.customer_entitlement_id
    local credit_cost = ent_obj.credit_cost or 1
    local min_balance = ent_obj.min_balance
    local has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
    
    -- Check usage_allowed
    local usage_allowed = ent_obj.usage_allowed
    if usage_allowed == cjson.null then usage_allowed = false end
    usage_allowed = usage_allowed or overage_behavior_is_allow
    
    if not usage_allowed then
      table.insert(logs, "PASS2 skipping " .. ent_id .. " - usage_allowed=false")
    else
      local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
      
      if cus_ent then
        local cp_idx_0 = cp_idx - 1
        local ce_idx_0 = ce_idx - 1
        local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
        
        local deducted = 0
        
        if has_entity_scope and target_entity_id then
          -- Read FRESH balance
          local entity_data = read_current_entity_balance(cache_key, base_path, target_entity_id)
          local entity_balance = entity_data and entity_data.balance or 0
          
          table.insert(logs, "PASS2 entity " .. target_entity_id .. " FRESH balance=" .. tostring(entity_balance))
          
          -- In pass 2, we can go negative (respecting min_balance if set)
          local to_deduct = remaining_amount * credit_cost
          if min_balance then
            to_deduct = math.min(to_deduct, entity_balance - min_balance)
          end
          to_deduct = math.max(0, to_deduct) -- Still can't deduct negative amount
          
          if to_deduct > 0 then
            local entity_path = build_entity_path(base_path, target_entity_id)
            redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.balance', -to_deduct)
            table.insert(logs, "JSON.NUMINCRBY " .. entity_path .. '.balance ' .. tostring(-to_deduct))
            
            if alter_granted_balance then
              redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.adjustment', -to_deduct)
            end
            
            deducted = to_deduct
            remaining_amount = remaining_amount - (to_deduct / credit_cost)
          end
          
        elseif has_entity_scope and not target_entity_id then
          -- All entities
          local current_entities = read_current_entities(cache_key, base_path)
          
          local entity_keys = {}
          for k in pairs(current_entities) do
            table.insert(entity_keys, k)
          end
          table.sort(entity_keys)
          
          for _, entity_key in ipairs(entity_keys) do
            if remaining_amount == 0 then break end
            
            local entity_data = read_current_entity_balance(cache_key, base_path, entity_key)
            local entity_balance = entity_data and entity_data.balance or 0
            
            local to_deduct = remaining_amount * credit_cost
            if min_balance then
              to_deduct = math.min(to_deduct, entity_balance - min_balance)
            end
            to_deduct = math.max(0, to_deduct)
            
            if to_deduct > 0 then
              local entity_path = build_entity_path(base_path, entity_key)
              redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.balance', -to_deduct)
              
              if alter_granted_balance then
                redis.call('JSON.NUMINCRBY', cache_key, entity_path .. '.adjustment', -to_deduct)
              end
              
              deducted = deducted + to_deduct
              remaining_amount = remaining_amount - (to_deduct / credit_cost)
            end
          end
          
        else
          -- TOP-LEVEL
          local current_balance = read_current_balance(cache_key, base_path)
          
          table.insert(logs, "PASS2 top-level FRESH balance=" .. tostring(current_balance))
          
          local to_deduct = remaining_amount * credit_cost
          if min_balance then
            to_deduct = math.min(to_deduct, current_balance - min_balance)
          end
          to_deduct = math.max(0, to_deduct)
          
          if to_deduct > 0 then
            redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.balance', -to_deduct)
            table.insert(logs, "JSON.NUMINCRBY " .. base_path .. '.balance ' .. tostring(-to_deduct))
            
            if alter_granted_balance then
              redis.call('JSON.NUMINCRBY', cache_key, base_path .. '.adjustment', -to_deduct)
            end
            
            deducted = to_deduct
            remaining_amount = remaining_amount - (to_deduct / credit_cost)
          end
        end
        
        -- Track deduction
        if deducted > 0 then
          if not updates[ent_id] then
            updates[ent_id] = { deducted = 0, additional_deducted = 0 }
          end
          updates[ent_id].deducted = (updates[ent_id].deducted or 0) + deducted
        end
        
        table.insert(logs, "PASS2 ent " .. ent_id .. " deducted=" .. tostring(deducted) .. " remaining=" .. tostring(remaining_amount))
      end
    end
  end
end

table.insert(logs, "=== PASS 2 END === remaining=" .. tostring(remaining_amount))

-- Safety check: if we still have remaining after both passes with reject mode,
-- another concurrent request may have depleted the balance between our pre-check and deductions.
-- The pre-check should catch most cases, but this handles the race condition edge case.
-- The updates contain what was actually deducted (for potential rollback by caller).
if remaining_amount > 0 and overage_behaviour == 'reject' then
  return cjson.encode({
    error = 'INSUFFICIENT_BALANCE',
    feature_id = feature_id,
    remaining = remaining_amount,
    updates = updates -- Contains partial deductions that were applied
  })
end

end -- End of "if not is_refund then"

-- Read final balances for return value
for ent_id, update in pairs(updates) do
  local cus_ent, cus_product, ce_idx, cp_idx = find_entitlement(full_customer, ent_id)
  if cus_ent then
    local cp_idx_0 = cp_idx - 1
    local ce_idx_0 = ce_idx - 1
    local base_path = '$.customer_products[' .. cp_idx_0 .. '].customer_entitlements[' .. ce_idx_0 .. ']'
    
    local has_entity_scope = false
    for _, ent_obj in ipairs(sorted_entitlements) do
      if ent_obj.customer_entitlement_id == ent_id then
        has_entity_scope = ent_obj.entity_feature_id ~= nil and ent_obj.entity_feature_id ~= cjson.null
        break
      end
    end
    
    if has_entity_scope then
      update.entities = read_current_entities(cache_key, base_path)
      update.balance = cus_ent.balance -- Top-level unchanged for entity-scoped
    else
      update.balance = read_current_balance(cache_key, base_path)
    end
    update.adjustment = cus_ent.adjustment or 0
    update.additional_balance = cus_ent.additional_balance or 0
  end
end

table.insert(logs, "=== LUA DEDUCTION END ===")

return cjson.encode({
  updates = updates,
  remaining = remaining_amount,
  error = cjson.null,
  logs = logs
})
