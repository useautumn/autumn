-- ============================================================================
-- LOCK RECEIPT HELPERS
-- Helpers for loading, building, and storing lock receipts in RedisJSON
-- ============================================================================

-- ============================================================================
-- HELPER: Decode a RedisJSON root value
-- JSON.GET on '$' returns an array of matches, so unwrap the first element.
-- ============================================================================
local function decode_root_json(result)
  if is_nil(result) then
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
-- HELPER: Load lock receipt from Redis
-- Returns the decoded receipt table or nil if the key does not exist.
-- ============================================================================
local function load_lock_receipt(lock_receipt_key)
  local result = redis.call('JSON.GET', lock_receipt_key, '$')
  return decode_root_json(result)
end

-- ============================================================================
-- HELPER: Store lock receipt in Redis
-- Overwrites the full receipt document at the lock receipt key.
-- ============================================================================
local function store_lock_receipt(lock_receipt_key, receipt)
  redis.call('JSON.SET', lock_receipt_key, '$', cjson.encode(receipt))
  return receipt
end

-- ============================================================================
-- HELPER: Save a lock receipt from deduction update objects
--
-- params:
--   lock_receipt_key: string
--   receipt: table (base receipt metadata to persist)
--   mutation_logs: table | nil
-- ============================================================================
local function save_lock_receipt_from_updates(params)
  local receipt = params.receipt or {}
  local mutation_logs = params.mutation_logs or {}
  receipt.items = #mutation_logs > 0 and mutation_logs or cjson.decode('[]')

  return store_lock_receipt(params.lock_receipt_key, receipt)
end
