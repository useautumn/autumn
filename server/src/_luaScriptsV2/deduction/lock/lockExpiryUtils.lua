-- ============================================================================
-- LOCK EXPIRY HELPERS
-- Helpers for indexing lock expiries in a Redis sorted set
-- ============================================================================

-- ============================================================================
-- HELPER: Add lock to expiry index
-- No-op when expires_at_ms is nil/null.
-- ============================================================================
local function add_lock_expiry(expiry_zset_key, lock_receipt_key, expires_at_ms)
  if is_nil(expires_at_ms) then
    return 0
  end

  return redis.call('ZADD', expiry_zset_key, tostring(expires_at_ms), lock_receipt_key)
end

-- ============================================================================
-- HELPER: Remove lock from expiry index
-- ============================================================================
local function remove_lock_expiry(expiry_zset_key, lock_receipt_key)
  return redis.call('ZREM', expiry_zset_key, lock_receipt_key)
end
