-- Cache readers round balance fields to 10 decimal places before building guards.
local CACHE_BALANCE_ROUNDING_EPSILON = 0.000000000051

local function has_expected_balance_mismatch(actual, expected)
  return math.abs(safe_number(actual) - safe_number(expected)) > CACHE_BALANCE_ROUNDING_EPSILON
end

local function has_ambiguous_relative_update(update)
  return (not is_absent(update.balance) and not is_absent(update.balance_delta))
    or (not is_absent(update.adjustment) and not is_absent(update.adjustment_delta))
end

local function has_expected_value_mismatch(subject_balance, update)
  if not is_absent(update.expected_balance)
    and has_expected_balance_mismatch(subject_balance.balance, update.expected_balance) then
    return true
  end

  if not is_absent(update.expected_adjustment)
    and has_expected_balance_mismatch(subject_balance.adjustment, update.expected_adjustment) then
    return true
  end

  if not is_absent(update.expected_next_reset_at)
    and safe_number(subject_balance.next_reset_at) ~= safe_number(update.expected_next_reset_at) then
    return true
  end

  return false
end
