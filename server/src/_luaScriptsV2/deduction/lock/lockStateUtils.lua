-- ============================================================================
-- RESERVATION STATE HELPERS
-- Helpers for guarding lock receipt state transitions.
-- Only two valid statuses: 'pending' (default) and 'processing' (claimed).
-- ============================================================================

-- ============================================================================
-- HELPER: Enforce pending state (for claim guard)
-- Returns nil when valid, or an error code string when invalid.
-- ============================================================================
local function require_pending_receipt(receipt)
  if is_nil(receipt) then
    return 'RESERVATION_NOT_FOUND'
  end

  local status = receipt.status
  if is_nil(status) or status == 'pending' then
    return nil
  end

  if status == 'processing' then
    return 'RESERVATION_ALREADY_PROCESSING'
  end

  return 'INVALID_RESERVATION_STATUS'
end

-- ============================================================================
-- HELPER: Enforce processing state (for callers that already claimed the receipt)
-- Returns nil when valid, or an error code string when invalid.
-- ============================================================================
local function require_processing_receipt(receipt)
  if is_nil(receipt) then
    return 'RESERVATION_NOT_FOUND'
  end

  local status = receipt.status
  if status == 'processing' then
    return nil
  end

  return 'RESERVATION_NOT_CLAIMED'
end
