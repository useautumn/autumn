-- ============================================================================
-- RESERVATION STATE HELPERS
-- Helpers for guarding and transitioning lock receipt state
-- ============================================================================

local RESERVATION_STATUS_PENDING = 'pending'
local RESERVATION_STATUS_CONFIRMED = 'confirmed'
local RESERVATION_STATUS_RELEASED = 'released'
local RESERVATION_STATUS_EXPIRED = 'expired'

-- ============================================================================
-- HELPER: Read normalized receipt status
-- Defaults to pending if status is absent to ease early migrations.
-- ============================================================================
local function get_reservation_status(receipt)
  if is_nil(receipt) or is_nil(receipt.status) then
    return RESERVATION_STATUS_PENDING
  end

  return receipt.status
end

-- ============================================================================
-- GUARDS
-- ============================================================================

local function is_pending_receipt(receipt)
  return get_reservation_status(receipt) == RESERVATION_STATUS_PENDING
end

local function is_confirmed_receipt(receipt)
  return get_reservation_status(receipt) == RESERVATION_STATUS_CONFIRMED
end

local function is_released_receipt(receipt)
  return get_reservation_status(receipt) == RESERVATION_STATUS_RELEASED
end

local function is_expired_receipt(receipt)
  return get_reservation_status(receipt) == RESERVATION_STATUS_EXPIRED
end

local function is_terminal_receipt(receipt)
  return is_confirmed_receipt(receipt) or is_released_receipt(receipt) or is_expired_receipt(receipt)
end

-- ============================================================================
-- HELPER: Mutate receipt status in memory
-- ============================================================================
local function set_reservation_status(receipt, status)
  receipt.status = status
  return receipt
end

-- ============================================================================
-- HELPER: Enforce pending state
-- Returns nil when valid, or an error code string when invalid.
-- ============================================================================
local function require_pending_receipt(receipt)
  if is_nil(receipt) then
    return 'RESERVATION_NOT_FOUND'
  end

  local status = get_reservation_status(receipt)
  if status == RESERVATION_STATUS_PENDING then
    return nil
  end

  if status == RESERVATION_STATUS_CONFIRMED then
    return 'RESERVATION_ALREADY_CONFIRMED'
  end

  if status == RESERVATION_STATUS_RELEASED then
    return 'RESERVATION_ALREADY_RELEASED'
  end

  if status == RESERVATION_STATUS_EXPIRED then
    return 'RESERVATION_ALREADY_EXPIRED'
  end

  return 'INVALID_RESERVATION_STATUS'
end
