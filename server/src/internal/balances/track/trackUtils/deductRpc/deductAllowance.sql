-- Main function: Deduct allowance from customer entitlements
DROP FUNCTION IF EXISTS deduct_allowance_from_entitlements(jsonb, numeric, text, text[]);

CREATE FUNCTION deduct_allowance_from_entitlements(
  sorted_entitlements jsonb,
  amount_to_deduct numeric,
  target_entity_id text DEFAULT NULL,
  rollover_ids text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  remaining_amount numeric := amount_to_deduct;
  rollover_deducted numeric := 0;
  ent_id text;
  credit_cost numeric;
  usage_allowed boolean;
  min_balance numeric;
  add_to_adjustment boolean;
  ent_obj jsonb;
  
  current_balance numeric;
  current_adjustment numeric;
  current_entities jsonb;
  has_entity_scope boolean;
  
  new_entities jsonb;
  new_balance numeric;
  new_adjustment numeric;
  deducted numeric;
  
  updates_json jsonb := '{}'::jsonb;
  result_json jsonb;
BEGIN
  -- Then deduct from entitlements
  FOR ent_obj IN SELECT * FROM jsonb_array_elements(sorted_entitlements)
  LOOP
    EXIT WHEN remaining_amount <= 0;
    
    -- Extract entitlement info
    ent_id := ent_obj->>'customer_entitlement_id';
    credit_cost := (ent_obj->>'credit_cost')::numeric;
    usage_allowed := COALESCE((ent_obj->>'usage_allowed')::boolean, false);
    min_balance := (ent_obj->>'min_balance')::numeric;
    add_to_adjustment := COALESCE((ent_obj->>'add_to_adjustment')::boolean, false);
    has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
    
    -- First, deduct from rollovers if this is the first entitlement
    IF rollover_ids IS NOT NULL AND array_length(rollover_ids, 1) > 0 AND rollover_deducted = 0 THEN
      SELECT * INTO rollover_deducted
      FROM deduct_from_rollovers(rollover_ids, remaining_amount, target_entity_id, has_entity_scope);
      
      remaining_amount := remaining_amount - rollover_deducted;
    END IF;
    
    -- Fetch entitlement data with row lock
    SELECT ce.balance, COALESCE(ce.adjustment, 0), COALESCE(ce.entities, '{}'::jsonb)
    INTO current_balance, current_adjustment, current_entities
    FROM customer_entitlements ce
    WHERE ce.id = ent_id
    FOR UPDATE;
    
    -- Handle entity-scoped entitlements
    IF has_entity_scope THEN
      IF target_entity_id IS NOT NULL THEN
        -- Deduct from specific entity
        SELECT * INTO new_entities, deducted
        FROM deduct_from_single_entity(
          current_entities,
          target_entity_id,
          remaining_amount * credit_cost,
          usage_allowed,
          min_balance,
          add_to_adjustment
        );
      ELSE
        -- Deduct from all entities
        SELECT * INTO new_entities, deducted
        FROM deduct_from_all_entities(
          current_entities,
          remaining_amount * credit_cost,
          usage_allowed,
          min_balance,
          add_to_adjustment
        );
      END IF;
      
      -- Update entities and optionally adjustment
      IF deducted != 0 THEN
        IF add_to_adjustment THEN
          UPDATE customer_entitlements ce
          SET entities = new_entities, adjustment = adjustment + deducted
          WHERE ce.id = ent_id
          RETURNING ce.adjustment INTO new_adjustment;
        ELSE
          UPDATE customer_entitlements ce
          SET entities = new_entities
          WHERE ce.id = ent_id
          RETURNING ce.adjustment INTO new_adjustment;
        END IF;
        
        -- Add to updates
        updates_json := jsonb_set(
          updates_json,
          ARRAY[ent_id],
          jsonb_build_object(
            'balance', current_balance,
            'entities', new_entities,
            'adjustment', new_adjustment,
            'deducted', deducted
          )
        );
        
        remaining_amount := remaining_amount - (deducted / credit_cost);
      END IF;
      
    -- Handle regular balance
    ELSE
      -- Calculate deduction respecting min_balance
      IF usage_allowed THEN
        -- If min_balance is null, allow unlimited deduction
        IF min_balance IS NULL THEN
          deducted := remaining_amount * credit_cost;
        ELSE
          deducted := LEAST(remaining_amount * credit_cost, current_balance - min_balance);
        END IF;
      ELSE
        deducted := LEAST(current_balance, remaining_amount * credit_cost);
      END IF;
      
      IF deducted != 0 THEN
        IF add_to_adjustment THEN
          UPDATE customer_entitlements ce
          SET balance = balance - deducted, adjustment = adjustment + deducted
          WHERE ce.id = ent_id
          RETURNING ce.balance, ce.adjustment INTO new_balance, new_adjustment;
        ELSE
          UPDATE customer_entitlements ce
          SET balance = balance - deducted
          WHERE ce.id = ent_id
          RETURNING ce.balance, ce.adjustment INTO new_balance, new_adjustment;
        END IF;
        
        -- Add to updates
        updates_json := jsonb_set(
          updates_json,
          ARRAY[ent_id],
          jsonb_build_object(
            'balance', new_balance,
            'entities', current_entities,
            'adjustment', new_adjustment,
            'deducted', deducted
          )
        );
        
        remaining_amount := remaining_amount - (deducted / credit_cost);
      END IF;
    END IF;
  END LOOP;
  
  -- Build final result
  result_json := jsonb_build_object(
    'updates', updates_json,
    'remaining', remaining_amount
  );
  
  RETURN result_json;
END;
$$;
