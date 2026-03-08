-- ============================================================================
-- RESERVATION EXPIRY HELPERS
-- Helpers for indexing reservation expiries in a Redis sorted set
-- ============================================================================

-- ============================================================================
-- HELPER: Add reservation to expiry index
-- No-op when expires_at_ms is nil/null.
-- ============================================================================
local function add_reservation_expiry(expiry_zset_key, reservation_key, expires_at_ms)
  if expires_at_ms == nil or expires_at_ms == cjson.null then
    return 0
  end

  return redis.call('ZADD', expiry_zset_key, tostring(expires_at_ms), reservation_key)
end

-- ============================================================================
-- HELPER: Remove reservation from expiry index
-- ============================================================================
local function remove_reservation_expiry(expiry_zset_key, reservation_key)
  return redis.call('ZREM', expiry_zset_key, reservation_key)
end
