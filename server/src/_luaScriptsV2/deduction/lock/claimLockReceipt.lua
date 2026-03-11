-- ============================================================================
-- CLAIM LOCK RECEIPT
-- Atomically transitions a lock receipt from 'pending' -> 'processing'.
--
-- KEYS[1]: lock_receipt_key
--
-- Returns nil on success (claim granted).
-- Returns an error code string if the receipt is not claimable.
-- ============================================================================

local lock_receipt_key = KEYS[1]

local receipt = load_lock_receipt(lock_receipt_key)

local err = require_pending_receipt(receipt)
if err ~= nil then
  return err
end

redis.call('JSON.SET', lock_receipt_key, '$.status', '"processing"')

return 'OK'
