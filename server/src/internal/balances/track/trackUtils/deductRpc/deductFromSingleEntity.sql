-- Helper: Deduct from a single entity in entities JSONB
DROP FUNCTION IF EXISTS deduct_from_single_entity(jsonb, text, numeric, boolean, numeric, boolean);

CREATE FUNCTION deduct_from_single_entity(
  entities_json jsonb,
  entity_id text,
  amount numeric,
  allow_negative boolean DEFAULT false,
  min_balance numeric DEFAULT 0,
  track_adjustment boolean DEFAULT false
)
RETURNS TABLE(updated_entities jsonb, deducted numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  entity_balance numeric;
  entity_adjustment numeric;
  actual_deduction numeric;
  new_balance numeric;
  new_adjustment numeric;
  new_entities jsonb;
BEGIN
  entity_balance := COALESCE((entities_json->entity_id->>'balance')::numeric, 0);
  entity_adjustment := COALESCE((entities_json->entity_id->>'adjustment')::numeric, 0);
  
  -- Calculate deduction respecting min_balance
  IF allow_negative THEN
    -- If min_balance is null, allow unlimited deduction
    IF min_balance IS NULL THEN
      actual_deduction := amount;
    ELSE
      -- Can go negative, but not below min_balance
      actual_deduction := LEAST(amount, entity_balance - min_balance);
    END IF;
  ELSE
    -- Cap at current balance (min 0)
    actual_deduction := LEAST(entity_balance, amount);
  END IF;
  
  IF actual_deduction != 0 THEN
    new_balance := entity_balance - actual_deduction;
    new_entities := jsonb_set(
      entities_json,
      ARRAY[entity_id, 'balance'],
      to_jsonb(new_balance)
    );
    
    -- Update adjustment if tracking
    IF track_adjustment THEN
      new_adjustment := entity_adjustment + actual_deduction;
      new_entities := jsonb_set(
        new_entities,
        ARRAY[entity_id, 'adjustment'],
        to_jsonb(new_adjustment)
      );
    END IF;
  ELSE
    new_entities := entities_json;
  END IF;
  
  RETURN QUERY SELECT new_entities, actual_deduction;
END;
$$;

