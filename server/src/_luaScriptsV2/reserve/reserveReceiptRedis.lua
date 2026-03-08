-- ============================================================================
-- RESERVATION RECEIPT REDIS HELPERS
-- Helpers for loading and storing reservation receipts in RedisJSON
-- ============================================================================

-- ============================================================================
-- HELPER: Decode a RedisJSON root value
-- JSON.GET on '$' returns an array of matches, so unwrap the first element.
-- ============================================================================
local function decode_root_json(result)
  if not result or result == cjson.null then
    return nil
  end

  local decoded = cjson.decode(result)
  if type(decoded) == 'table' and decoded[1] ~= nil then
    decoded = decoded[1]
  end

  if type(decoded) ~= 'table' then
    return nil
  end

  return decoded
end

-- ============================================================================
-- HELPER: Load reservation receipt from Redis
-- Returns the decoded receipt table or nil if the key does not exist.
-- ============================================================================
local function load_reservation_receipt(reservation_key)
  local result = redis.call('JSON.GET', reservation_key, '$')
  return decode_root_json(result)
end

-- ============================================================================
-- HELPER: Store reservation receipt in Redis
-- Overwrites the full receipt document at the reservation key.
-- ============================================================================
local function store_reservation_receipt(reservation_key, receipt)
  redis.call('JSON.SET', reservation_key, '$', cjson.encode(receipt))
  return receipt
end
