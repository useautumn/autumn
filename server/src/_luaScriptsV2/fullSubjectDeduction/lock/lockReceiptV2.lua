-- ============================================================================
-- LOCK RECEIPT HELPERS (V2 — plain string storage)
-- V2 variant of deduction/lock/lockReceipt.lua. Stores the lock receipt as a
-- plain string via core Redis GET/SET instead of RedisJSON JSON.GET/JSON.SET.
--
-- Why: fewer Redis calls per lock save (combined SET NX EXAT), no RedisJSON
-- module parse/serialize overhead. V2 full-subject cache has no legacy
-- RedisJSON lock receipts so plain GET is safe.
--
-- Function names intentionally match deduction/lock/lockReceipt.lua so scripts
-- that import these helpers (deductFromSubjectBalances.lua, unwindLockV2.lua,
-- claimLockReceiptV2.lua) don't need call-site changes — only the bundle swaps
-- which helper file is included.
--
-- Depends on:
--   - is_nil (luaUtils.lua)
-- ============================================================================

-- ============================================================================
-- HELPER: Load lock receipt from Redis
-- Returns the decoded receipt table, or nil if the key does not exist / is
-- unparseable.
-- ============================================================================
local function load_lock_receipt(lock_receipt_key)
  local raw = redis.call('GET', lock_receipt_key)
  if is_nil(raw) or raw == false then
    return nil
  end

  local ok, decoded = pcall(cjson.decode, raw)
  if not ok or type(decoded) ~= 'table' then
    return nil
  end

  return decoded
end

-- ============================================================================
-- HELPER: Store lock receipt in Redis (full overwrite, no TTL change)
-- Use `save_lock_receipt_from_updates` when you want to set a TTL atomically.
-- Use this when updating an existing receipt whose TTL should be preserved —
-- callers should pair with `SET ... KEEPTTL` instead of this helper if they
-- want to keep the existing TTL; plain SET here clears it.
-- ============================================================================
local function store_lock_receipt(lock_receipt_key, receipt)
  redis.call('SET', lock_receipt_key, cjson.encode(receipt))
  return receipt
end

-- ============================================================================
-- HELPER: Overwrite an existing lock receipt and preserve its TTL.
-- Used by the claim path (pending -> processing) where we mutate one field and
-- write the full receipt back without resetting the expiry.
-- ============================================================================
local function store_lock_receipt_keep_ttl(lock_receipt_key, receipt)
  redis.call('SET', lock_receipt_key, cjson.encode(receipt), 'KEEPTTL')
  return receipt
end

-- ============================================================================
-- HELPER: Save a lock receipt from deduction update objects.
--
-- Combines the previous `JSON.SET + EXPIREAT` into a single `SET ... EXAT` so
-- the whole operation is one Redis round trip. When `ttl_at` is nil the TTL is
-- omitted (the key will persist until explicitly deleted or overwritten).
--
-- params:
--   lock_receipt_key: string
--   receipt: table (base receipt metadata to persist)
--   mutation_logs: table | nil
--   ttl_at: number | nil (Unix seconds for EXAT)
-- ============================================================================
local function save_lock_receipt_from_updates(params)
  local receipt = params.receipt or {}
  local mutation_logs = params.mutation_logs or {}
  receipt.items = #mutation_logs > 0 and mutation_logs or cjson.decode('[]')

  local encoded = cjson.encode(receipt)

  if not is_nil(params.ttl_at) then
    redis.call('SET', params.lock_receipt_key, encoded, 'EXAT', params.ttl_at)
  else
    redis.call('SET', params.lock_receipt_key, encoded)
  end

  return receipt
end

-- ============================================================================
-- HELPER: Atomically create a lock receipt if no receipt exists at that key.
-- Returns true on success, false if a receipt is already present.
--
-- This is the Lua analogue of the TS `SET NX EXAT` path in saveLockReceipt.ts.
-- Use when you want a single-RT "create if absent" (replaces EXISTS + SET +
-- EXPIREAT).
--
-- params:
--   lock_receipt_key: string
--   receipt: table
--   mutation_logs: table | nil
--   ttl_at: number | nil (Unix seconds for EXAT)
-- ============================================================================
local function create_lock_receipt_if_absent(params)
  local receipt = params.receipt or {}
  local mutation_logs = params.mutation_logs or {}
  receipt.items = #mutation_logs > 0 and mutation_logs or cjson.decode('[]')

  local encoded = cjson.encode(receipt)

  local result
  if not is_nil(params.ttl_at) then
    result = redis.call('SET', params.lock_receipt_key, encoded, 'NX', 'EXAT', params.ttl_at)
  else
    result = redis.call('SET', params.lock_receipt_key, encoded, 'NX')
  end

  return result == 'OK'
end
