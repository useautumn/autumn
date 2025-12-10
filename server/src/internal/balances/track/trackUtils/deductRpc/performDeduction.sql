-- Main function: Perform deduction from customer entitlements
-- Three-step deduction strategy:
--   Step 1: Deduct from rollovers
--   Step 2: Deduct from additional_balance (if skip_additional_balance=false)
--   Step 3: Deduct from main balance (Pass 1 to 0, Pass 2 negative if allowed)
DROP FUNCTION IF EXISTS deduct_from_cus_ents(jsonb);

CREATE FUNCTION deduct_from_cus_ents(params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  -- Extract parameters from JSONB
  sorted_entitlements jsonb := params->'sorted_entitlements';
  amount_to_deduct numeric := NULLIF((params->>'amount_to_deduct')::numeric, NULL);
  target_balance numeric := NULLIF((params->>'target_balance')::numeric, NULL);
  target_entity_id text := NULLIF(params->>'target_entity_id', '');
  rollover_ids text[] := CASE 
    WHEN params->'rollover_ids' IS NULL OR jsonb_typeof(params->'rollover_ids') != 'array' THEN NULL
    ELSE ARRAY(SELECT jsonb_array_elements_text(params->'rollover_ids'))
  END;
  cus_ent_ids text[] := CASE 
    WHEN params->'cus_ent_ids' IS NULL OR jsonb_typeof(params->'cus_ent_ids') != 'array' THEN NULL
    ELSE ARRAY(SELECT jsonb_array_elements_text(params->'cus_ent_ids'))
  END;
  skip_additional_balance boolean := COALESCE((params->>'skip_additional_balance')::boolean, false);
  alter_granted_balance boolean := COALESCE((params->>'alter_granted_balance')::boolean, false);
  overage_behaviour text := NULLIF(params->>'overage_behaviour', '');
  feature_id text := NULLIF(params->>'feature_id', '');
  
  remaining_amount numeric;
  rollover_deducted numeric := 0;
  ent_obj jsonb;
  -- Entitlement properties
  ent_id text;
  credit_cost numeric;
  usage_allowed boolean;
  min_balance numeric;
  max_balance numeric;
  has_entity_scope boolean;

  -- Current state from DB
  current_balance numeric;
  current_additional_balance numeric;
  current_adjustment numeric;
  current_entities jsonb;

  -- Balance update (alter_granted) variables
  diff numeric;
  freed_paid_portion numeric;

  -- Additional balance deduction
  additional_deducted numeric;
  new_additional_balance numeric;

  -- Results from deduction helper
  deducted numeric;
  new_balance numeric;
  new_entities jsonb;
  new_adjustment numeric;
  -- Tracking
  updates_json jsonb := '{}'::jsonb;
  result_json jsonb;
  
  -- For calculating total balance
  total_balance numeric;
BEGIN

  -- ============================================================================
  -- STEP 0: Lock all rows upfront to prevent deadlocks
  -- ============================================================================
  
  -- Lock all entitlement rows at once (prevents interleaved locking deadlocks)
  IF cus_ent_ids IS NOT NULL AND array_length(cus_ent_ids, 1) > 0 THEN
    PERFORM 1 FROM customer_entitlements ce WHERE ce.id = ANY(cus_ent_ids) FOR UPDATE;
  END IF;
  
  -- Lock all rollover rows at once
  IF rollover_ids IS NOT NULL AND array_length(rollover_ids, 1) > 0 THEN
    PERFORM 1 FROM rollovers r WHERE r.id = ANY(rollover_ids) FOR UPDATE;
  END IF;

  -- ============================================================================
  -- STEP 1: Calculate amount_to_deduct if target_balance is provided
  -- ============================================================================
  
  IF target_balance IS NOT NULL THEN
    -- Get total balance from entitlements and rollovers (including additional_balance)
    total_balance := get_total_balance(jsonb_build_object(
      'sorted_entitlements', sorted_entitlements,
      'target_entity_id', target_entity_id,
      'rollover_ids', rollover_ids
    ));
    
    -- Calculate amount_to_deduct (negative means we need to add)
    remaining_amount := total_balance - target_balance;
  ELSE
    -- Use provided amount_to_deduct
    remaining_amount := amount_to_deduct;
  END IF;
  
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
    max_balance := (ent_obj->>'max_balance')::numeric;
    has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
    
    -- STEP 1: Handle rollovers (only on first entitlement)
    IF rollover_ids IS NOT NULL AND array_length(rollover_ids, 1) > 0 AND rollover_deducted = 0 THEN
      SELECT * INTO rollover_deducted
      FROM deduct_from_rollovers(jsonb_build_object(
        'rollover_ids', rollover_ids,
        'amount_to_deduct', remaining_amount,
        'target_entity_id', target_entity_id,
        'has_entity_scope', has_entity_scope
      ));
      remaining_amount := remaining_amount - rollover_deducted;
    END IF;

    -- Fetch current state (rows already locked in STEP 0)
    SELECT
      ce.balance,
      COALESCE(ce.additional_balance, 0),
      COALESCE(ce.adjustment, 0),
      COALESCE(ce.entities, '{}'::jsonb)
    INTO
      current_balance,
      current_additional_balance,
      current_adjustment,
      current_entities
    FROM customer_entitlements ce
    WHERE ce.id = ent_id;

    -- STEP 2: Deduct from additional_balance (customer-level and entity-level)
    SELECT * INTO additional_deducted, new_additional_balance, new_adjustment, current_entities
    FROM deduct_from_additional_balance(jsonb_build_object(
      'current_additional_balance', current_additional_balance,
      'current_adjustment', current_adjustment,
      'current_entities', current_entities,
      'remaining_amount', remaining_amount,
      'credit_cost', credit_cost,
      'has_entity_scope', has_entity_scope,
      'target_entity_id', target_entity_id,
      'skip_additional_balance', skip_additional_balance,
      'alter_granted_balance', alter_granted_balance
    ));
    
    -- Reduce remaining_amount by what was deducted from additional_balance
    remaining_amount := remaining_amount - additional_deducted;

    -- STEP 3: Perform deduction from main balance (Pass 1: allow_negative = false)
    SELECT * INTO deducted, new_balance, new_entities, new_adjustment
    FROM deduct_from_main_balance(jsonb_build_object(
      'current_balance', current_balance,
      'current_entities', current_entities,
      'current_adjustment', new_adjustment,
      'amount_to_deduct', remaining_amount,
      'credit_cost', credit_cost,
      'allow_negative', false,
      'has_entity_scope', has_entity_scope,
      'target_entity_id', target_entity_id,
      'min_balance', min_balance,
      'max_balance', max_balance,
      'alter_granted_balance', alter_granted_balance
    ));

    -- STEP 4: Update database if any deduction occurred
    IF deducted != 0 OR additional_deducted != 0 THEN
      IF has_entity_scope THEN
        UPDATE customer_entitlements ce
        SET
          balance = new_balance,
          additional_balance = new_additional_balance,
          entities = new_entities,
          adjustment = new_adjustment
        WHERE ce.id = ent_id;
      ELSE
        -- Don't update entities for non-entity-scoped entitlements (keep NULL)
        UPDATE customer_entitlements ce
        SET
          balance = new_balance,
          additional_balance = new_additional_balance,
          adjustment = new_adjustment
        WHERE ce.id = ent_id;
      END IF;

      -- Track in updates_json (deducted is inclusive of additional_deducted)
      updates_json := jsonb_set(
        updates_json,
        ARRAY[ent_id],
        jsonb_build_object(
          'balance', new_balance,
          'additional_balance', new_additional_balance,
          'adjustment', new_adjustment,
          'entities', new_entities,
          'deducted', deducted + additional_deducted,
          'additional_deducted', additional_deducted
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
      max_balance := (ent_obj->>'max_balance')::numeric;
      has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
      
      -- Skip entitlements without usage_allowed
      IF NOT usage_allowed THEN
        CONTINUE;
      END IF;
      
      -- Fetch current state (rows already locked in STEP 0)
      SELECT
        ce.balance,
        COALESCE(ce.additional_balance, 0),
        COALESCE(ce.adjustment, 0),
        COALESCE(ce.entities, '{}'::jsonb)
      INTO
        current_balance,
        current_additional_balance,
        current_adjustment,
        current_entities
      FROM customer_entitlements ce
      WHERE ce.id = ent_id;

      -- Note: additional_balance was already processed in Pass 1, so we don't deduct from it here
      new_additional_balance := current_additional_balance;
      
      -- Perform deduction (Pass 2: allow_negative = true)
      SELECT * INTO deducted, new_balance, new_entities, new_adjustment
      FROM deduct_from_main_balance(jsonb_build_object(
        'current_balance', current_balance,
        'current_entities', current_entities,
        'current_adjustment', current_adjustment,
        'amount_to_deduct', remaining_amount,
        'credit_cost', credit_cost,
        'allow_negative', true,
        'has_entity_scope', has_entity_scope,
        'target_entity_id', target_entity_id,
        'min_balance', min_balance,
        'max_balance', max_balance,
        'alter_granted_balance', alter_granted_balance
      ));
      
      -- Update database if deduction occurred (or addition with negative amount)
      IF deducted != 0 THEN
        IF has_entity_scope THEN
          UPDATE customer_entitlements ce
          SET
            balance = new_balance,
            additional_balance = new_additional_balance,
            entities = new_entities,
            adjustment = new_adjustment
          WHERE ce.id = ent_id;
        ELSE
          -- Don't update entities for non-entity-scoped entitlements (keep NULL)
          UPDATE customer_entitlements ce
          SET
            balance = new_balance,
            additional_balance = new_additional_balance,
            adjustment = new_adjustment
          WHERE ce.id = ent_id;
        END IF;

        -- Update or create entry in updates_json
        IF updates_json ? ent_id THEN
          -- Update existing entry (entitlement was updated in both passes)
          -- deducted from Pass 1 already includes additional_deducted, so just add Pass 2 deducted
          updates_json := jsonb_set(
            updates_json,
            ARRAY[ent_id],
            jsonb_build_object(
              'balance', new_balance,
              'additional_balance', new_additional_balance,
              'adjustment', new_adjustment,
              'entities', new_entities,
              'deducted', (updates_json->ent_id->>'deducted')::numeric + deducted,
              'additional_deducted', COALESCE((updates_json->ent_id->>'additional_deducted')::numeric, 0)
            )
          );
        ELSE
          -- Create new entry (entitlement only updated in Pass 2, no additional_balance deduction)
          updates_json := jsonb_set(
            updates_json,
            ARRAY[ent_id],
            jsonb_build_object(
              'balance', new_balance,
              'additional_balance', new_additional_balance,
              'adjustment', new_adjustment,
              'entities', new_entities,
              'deducted', deducted,
              'additional_deducted', 0
            )
          );
        END IF;

        remaining_amount := remaining_amount - (deducted / credit_cost);
      END IF;
    END LOOP;
  END IF;
  
  -- Check overage behaviour
  IF remaining_amount > 0 AND overage_behaviour = 'reject' THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE|featureId:%|value:%|remaining:%', 
      feature_id,
      COALESCE(amount_to_deduct::text, '0'),
      remaining_amount;
  END IF;
  
  -- Build final result
  result_json := jsonb_build_object(
    'updates', updates_json,
    'remaining', remaining_amount
  );
  
  RETURN result_json;
END;
$$;

