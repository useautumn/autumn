-- Helper: Deduct from all entities iteratively
DROP FUNCTION IF EXISTS deduct_from_all_entities(jsonb, numeric, boolean, numeric, boolean);

CREATE FUNCTION deduct_from_all_entities(
  entities_json jsonb,
  amount numeric,
  allow_negative boolean DEFAULT false,
  min_balance numeric DEFAULT 0,
  track_adjustment boolean DEFAULT false
)
RETURNS TABLE(updated_entities jsonb, total_deducted numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  remaining numeric := amount;
  entity_key text;
  entity_balance numeric;
  entity_adjustment numeric;
  deduct_amount numeric;
  new_balance numeric;
  new_adjustment numeric;
  new_entities jsonb := entities_json;
  total_deducted numeric := 0;
BEGIN
  FOR entity_key IN SELECT jsonb_object_keys(entities_json)
  LOOP
    EXIT WHEN remaining <= 0;
    
    entity_balance := COALESCE((new_entities->entity_key->>'balance')::numeric, 0);
    entity_adjustment := COALESCE((new_entities->entity_key->>'adjustment')::numeric, 0);
    
    -- Calculate deduction respecting min_balance
    IF allow_negative THEN
      -- If min_balance is null, allow unlimited deduction
      IF min_balance IS NULL THEN
        deduct_amount := remaining;
      ELSE
        -- Can go negative, but not below min_balance
        deduct_amount := LEAST(remaining, entity_balance - min_balance);
      END IF;
    ELSE
      -- Cap at current balance (min 0)
      deduct_amount := LEAST(entity_balance, remaining);
    END IF;
    
    IF deduct_amount != 0 THEN
      new_balance := entity_balance - deduct_amount;
      new_entities := jsonb_set(
        new_entities,
        ARRAY[entity_key, 'balance'],
        to_jsonb(new_balance)
      );
      
      -- Update adjustment if tracking
      IF track_adjustment THEN
        new_adjustment := entity_adjustment + deduct_amount;
        new_entities := jsonb_set(
          new_entities,
          ARRAY[entity_key, 'adjustment'],
          to_jsonb(new_adjustment)
        );
      END IF;
      
      remaining := remaining - deduct_amount;
      total_deducted := total_deducted + deduct_amount;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT new_entities, total_deducted;
END;
$$;

