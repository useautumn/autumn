-- ============================================================================
-- READ BALANCES
-- Functions to read current balance state from Redis
-- ============================================================================

-- ============================================================================
-- HELPER: Read rollover data from Redis (fresh read)
-- Returns: { balance, usage, entities } or nil if not found
-- ============================================================================
local function read_rollover_data(cache_key, rollover_path)
  local result = redis.call('JSON.GET', cache_key, rollover_path)
  if not result or result == cjson.null then
    return nil
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
    usage = safe_number(decoded.usage),
    entities = safe_table(decoded.entities),
  }
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
