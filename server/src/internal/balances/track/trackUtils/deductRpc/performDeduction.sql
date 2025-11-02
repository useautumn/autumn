-- Main function: Perform deduction from customer entitlements
-- Two-pass strategy: 
--   Pass 1: Deduct all entitlements to 0
--   Pass 2: Allow usage_allowed=true entitlements to go negative
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
  ent_obj jsonb;
  
  -- Entitlement properties
  ent_id text;
  credit_cost numeric;
  usage_allowed boolean;
  min_balance numeric;
  add_to_adjustment boolean;
  has_entity_scope boolean;
  
  -- Current state from DB
  current_balance numeric;
  current_adjustment numeric;
  current_entities jsonb;
  
  -- Results from deduction helper
  deducted numeric;
  new_balance numeric;
  new_entities jsonb;
  new_adjustment numeric;
  
  -- Tracking
  updates_json jsonb := '{}'::jsonb;
  result_json jsonb;
BEGIN
  
  -- ============================================================================
  -- PASS 1: Deduct all entitlements down to 0 (or add if negative)
  -- ============================================================================
  FOR ent_obj IN SELECT * FROM jsonb_array_elements(sorted_entitlements)
  LOOP
    EXIT WHEN remaining_amount = 0;
    
    -- Extract entitlement properties
    ent_id := ent_obj->>'customer_entitlement_id';
    credit_cost := (ent_obj->>'credit_cost')::numeric;
    usage_allowed := COALESCE((ent_obj->>'usage_allowed')::boolean, false);
    min_balance := (ent_obj->>'min_balance')::numeric;
    add_to_adjustment := COALESCE((ent_obj->>'add_to_adjustment')::boolean, false);
    has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
    
    -- Handle rollovers (only on first entitlement)
    IF rollover_ids IS NOT NULL AND array_length(rollover_ids, 1) > 0 AND rollover_deducted = 0 THEN
      SELECT * INTO rollover_deducted
      FROM deduct_from_rollovers(rollover_ids, remaining_amount, target_entity_id, has_entity_scope);
      remaining_amount := remaining_amount - rollover_deducted;
    END IF;
    
    -- Fetch current state with row lock
    SELECT ce.balance, COALESCE(ce.adjustment, 0), COALESCE(ce.entities, '{}'::jsonb)
    INTO current_balance, current_adjustment, current_entities
    FROM customer_entitlements ce
    WHERE ce.id = ent_id
    FOR UPDATE;
    
    -- Perform deduction (Pass 1: allow_negative = false)
    SELECT * INTO deducted, new_balance, new_entities, new_adjustment
    FROM deduct_from_main_balance(
      current_balance,
      current_entities,
      current_adjustment,
      remaining_amount,
      credit_cost,
      false,  -- allow_negative = false in Pass 1
      has_entity_scope,
      target_entity_id,
      min_balance,
      add_to_adjustment
    );
    
    -- Update database if deduction occurred (or addition with negative amount)
    IF deducted != 0 THEN
      IF has_entity_scope THEN
        UPDATE customer_entitlements ce
        SET 
          balance = new_balance,
          entities = new_entities,
          adjustment = new_adjustment
        WHERE ce.id = ent_id;
      ELSE
        -- Don't update entities for non-entity-scoped entitlements (keep NULL)
        UPDATE customer_entitlements ce
        SET 
          balance = new_balance,
          adjustment = new_adjustment
        WHERE ce.id = ent_id;
      END IF;
      
      -- Track in updates_json
      updates_json := jsonb_set(
        updates_json,
        ARRAY[ent_id],
        jsonb_build_object(
          'balance', new_balance,
          'entities', new_entities,
          'adjustment', new_adjustment,
          'deducted', deducted
        )
      );
      
      remaining_amount := remaining_amount - (deducted / credit_cost);
    END IF;
  END LOOP;
  
  -- ============================================================================
  -- PASS 2: Allow usage_allowed=true entitlements to go negative
  -- ============================================================================
  IF remaining_amount > 0 THEN
    FOR ent_obj IN SELECT * FROM jsonb_array_elements(sorted_entitlements)
    LOOP
      EXIT WHEN remaining_amount = 0;
      
      -- Extract entitlement properties
      ent_id := ent_obj->>'customer_entitlement_id';
      credit_cost := (ent_obj->>'credit_cost')::numeric;
      usage_allowed := COALESCE((ent_obj->>'usage_allowed')::boolean, false);
      min_balance := (ent_obj->>'min_balance')::numeric;
      add_to_adjustment := COALESCE((ent_obj->>'add_to_adjustment')::boolean, false);
      has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
      
      -- Skip entitlements without usage_allowed
      IF NOT usage_allowed THEN
        CONTINUE;
      END IF;
      
      -- Fetch current state with row lock
      SELECT ce.balance, COALESCE(ce.adjustment, 0), COALESCE(ce.entities, '{}'::jsonb)
      INTO current_balance, current_adjustment, current_entities
      FROM customer_entitlements ce
      WHERE ce.id = ent_id
      FOR UPDATE;
      
      -- Perform deduction (Pass 2: allow_negative = true)
      SELECT * INTO deducted, new_balance, new_entities, new_adjustment
      FROM deduct_from_main_balance(
        current_balance,
        current_entities,
        current_adjustment,
        remaining_amount,
        credit_cost,
        true,  -- allow_negative = true in Pass 2
        has_entity_scope,
        target_entity_id,
        min_balance,
        add_to_adjustment
      );
      
      -- Update database if deduction occurred (or addition with negative amount)
      IF deducted != 0 THEN
        IF has_entity_scope THEN
          UPDATE customer_entitlements ce
          SET 
            balance = new_balance,
            entities = new_entities,
            adjustment = new_adjustment
          WHERE ce.id = ent_id;
        ELSE
          -- Don't update entities for non-entity-scoped entitlements (keep NULL)
          UPDATE customer_entitlements ce
          SET 
            balance = new_balance,
            adjustment = new_adjustment
          WHERE ce.id = ent_id;
        END IF;
        
        -- Update or create entry in updates_json
        IF updates_json ? ent_id THEN
          -- Update existing entry (entitlement was updated in both passes)
          updates_json := jsonb_set(
            updates_json,
            ARRAY[ent_id],
            jsonb_build_object(
              'balance', new_balance,
              'entities', new_entities,
              'adjustment', new_adjustment,
              'deducted', (updates_json->ent_id->>'deducted')::numeric + deducted
            )
          );
        ELSE
          -- Create new entry (entitlement only updated in Pass 2)
          updates_json := jsonb_set(
            updates_json,
            ARRAY[ent_id],
            jsonb_build_object(
              'balance', new_balance,
              'entities', new_entities,
              'adjustment', new_adjustment,
              'deducted', deducted
            )
          );
        END IF;
        
        remaining_amount := remaining_amount - (deducted / credit_cost);
      END IF;
    END LOOP;
  END IF;
  
  -- Build final result
  result_json := jsonb_build_object(
    'updates', updates_json,
    'remaining', remaining_amount
  );
  
  RETURN result_json;
END;
$$;

