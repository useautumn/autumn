-- Function: Update additional granted balance
-- Handles balances.update endpoint - sets balance to exact target value
-- Formula: current_balance = Math.max(0, balance) + additional_balance
DROP FUNCTION IF EXISTS update_additional_granted_balance(text, numeric, numeric, numeric);

CREATE FUNCTION update_additional_granted_balance(
  ent_id text,
  target_balance numeric,
  current_balance numeric,
  current_additional_balance numeric,
  current_additional_granted_balance numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  computed_current_balance numeric;
  diff numeric;
  new_balance numeric;
  new_additional_balance numeric;
  new_additional_granted_balance numeric;
  to_deduct_from_additional numeric;
  to_deduct_from_main numeric;
  result_json jsonb;
BEGIN
  -- Calculate current_balance using formula: Math.max(0, balance) + additional_balance
  computed_current_balance := GREATEST(0, current_balance) + current_additional_balance;

  -- Calculate diff from computed current to target
  diff := target_balance - computed_current_balance;

  -- Initialize new values
  new_balance := current_balance;
  new_additional_balance := current_additional_balance;
  new_additional_granted_balance := current_additional_granted_balance;

  IF diff = 0 THEN
    -- No change needed
    NULL;
  ELSIF diff > 0 THEN
    -- ADDING balance: increment both additional fields, leave balance unchanged
    new_additional_balance := current_additional_balance + diff;
    new_additional_granted_balance := current_additional_granted_balance + diff;
  ELSE
    -- REMOVING balance: deduct from additional_balance first (floor 0), then main balance
    -- Also adjust additional_granted by full diff (can go negative)
    to_deduct_from_additional := LEAST(current_additional_balance, ABS(diff));
    to_deduct_from_main := ABS(diff) - to_deduct_from_additional;

    new_additional_balance := current_additional_balance - to_deduct_from_additional;
    new_balance := current_balance - to_deduct_from_main;
    new_additional_granted_balance := current_additional_granted_balance + diff; -- diff is negative
  END IF;

  -- Update database
  UPDATE customer_entitlements ce
  SET
    balance = new_balance,
    additional_balance = new_additional_balance,
    additional_granted_balance = new_additional_granted_balance
  WHERE ce.id = ent_id;

  -- Build result
  result_json := jsonb_build_object(
    'balance', new_balance,
    'additional_balance', new_additional_balance,
    'additional_granted_balance', new_additional_granted_balance,
    'entities', '{}'::jsonb,
    'adjustment', 0,
    'deducted', 0
  );

  RETURN result_json;
END;
$$;

