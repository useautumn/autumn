-- Main function: Perform deduction from customer entitlements
-- Three-step deduction strategy:
--   Step 1: Deduct from rollovers
--   Step 2: Deduct from additional_balance (if skip_additional_balance=false)
--   Step 3: Deduct from main balance (Pass 1 to 0, Pass 2 negative if allowed)
DROP FUNCTION IF EXISTS deduct_allowance_from_entitlements(jsonb, numeric, text, text[], boolean, boolean);
DROP FUNCTION IF EXISTS deduct_allowance_from_entitlements(jsonb, numeric, text, text[], boolean);
DROP FUNCTION IF EXISTS deduct_allowance_from_entitlements(jsonb, numeric, text, text[]);

CREATE FUNCTION deduct_allowance_from_entitlements(
  sorted_entitlements jsonb,
  amount_to_deduct numeric,
  target_entity_id text DEFAULT NULL,
  rollover_ids text[] DEFAULT NULL,
  skip_additional_balance boolean DEFAULT false,
  alter_granted_balance boolean DEFAULT false
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
  current_additional_balance numeric;
  current_additional_granted_balance numeric;
  current_adjustment numeric;
  current_entities jsonb;

  -- Balance update (alter_granted) variables
  target_balance numeric;
  diff numeric;
  freed_paid_portion numeric;

  -- Additional balance deduction
  additional_deductible numeric;
  additional_deducted numeric;
  new_additional_balance numeric;
  new_additional_granted_balance numeric;

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
  -- ALTER_GRANTED BRANCH: Handle balances.update (set exact target balance)
  -- ============================================================================
  IF alter_granted_balance THEN
    -- For balances.update, amount_to_deduct is actually the target current_balance
    target_balance := amount_to_deduct;

    -- Process only the first entitlement
    FOR ent_obj IN SELECT * FROM jsonb_array_elements(sorted_entitlements) LIMIT 1
    LOOP
      ent_id := ent_obj->>'customer_entitlement_id';

      -- Fetch current state
      SELECT
        ce.balance,
        COALESCE(ce.additional_balance, 0),
        COALESCE(ce.additional_granted_balance, 0)
      INTO
        current_balance,
        current_additional_balance,
        current_additional_granted_balance
      FROM customer_entitlements ce
      WHERE ce.id = ent_id
      FOR UPDATE;

      -- Calculate current_balance using formula: Math.max(0, balance) + additional_balance
      DECLARE
        computed_current_balance numeric;
      BEGIN
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

          DECLARE
            to_deduct_from_additional numeric;
            to_deduct_from_main numeric;
          BEGIN
            to_deduct_from_additional := LEAST(current_additional_balance, ABS(diff));
            to_deduct_from_main := ABS(diff) - to_deduct_from_additional;

            new_additional_balance := current_additional_balance - to_deduct_from_additional;
            new_balance := current_balance - to_deduct_from_main;
            new_additional_granted_balance := current_additional_granted_balance + diff; -- diff is negative
          END;
        END IF;
      END;

      -- Update database
      UPDATE customer_entitlements ce
      SET
        balance = new_balance,
        additional_balance = new_additional_balance,
        additional_granted_balance = new_additional_granted_balance
      WHERE ce.id = ent_id;

      -- Track in updates_json
      updates_json := jsonb_set(
        updates_json,
        ARRAY[ent_id],
        jsonb_build_object(
          'balance', new_balance,
          'additional_balance', new_additional_balance,
          'additional_granted_balance', new_additional_granted_balance,
          'entities', '{}'::jsonb,
          'adjustment', 0,
          'deducted', 0
        )
      );
    END LOOP;

    -- Build result and return early
    result_json := jsonb_build_object(
      'updates', updates_json,
      'remaining', 0
    );

    RETURN result_json;
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
    add_to_adjustment := COALESCE((ent_obj->>'add_to_adjustment')::boolean, false);
    has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
    
    -- STEP 1: Handle rollovers (only on first entitlement)
    IF rollover_ids IS NOT NULL AND array_length(rollover_ids, 1) > 0 AND rollover_deducted = 0 THEN
      SELECT * INTO rollover_deducted
      FROM deduct_from_rollovers(rollover_ids, remaining_amount, target_entity_id, has_entity_scope);
      remaining_amount := remaining_amount - rollover_deducted;
    END IF;

    -- Fetch current state with row lock
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
    WHERE ce.id = ent_id
    FOR UPDATE;

    -- STEP 2: Deduct from additional_balance (only if skip=false and positive amount)
    additional_deducted := 0;
    new_additional_balance := current_additional_balance;

    IF NOT skip_additional_balance AND remaining_amount > 0 AND current_additional_balance > 0 THEN
      -- Normal deduction from additional_balance (positive tracking)
      additional_deductible := LEAST(remaining_amount * credit_cost, current_additional_balance);

      IF additional_deductible > 0 THEN
        additional_deducted := additional_deductible / credit_cost;
        new_additional_balance := current_additional_balance - additional_deductible;
        remaining_amount := remaining_amount - additional_deducted;
      END IF;
    END IF;

    -- STEP 3: Perform deduction from main balance (Pass 1: allow_negative = false)
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

      -- Track in updates_json
      updates_json := jsonb_set(
        updates_json,
        ARRAY[ent_id],
        jsonb_build_object(
          'balance', new_balance,
          'additional_balance', new_additional_balance,
          'entities', new_entities,
          'adjustment', new_adjustment,
          'deducted', deducted,
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
      add_to_adjustment := COALESCE((ent_obj->>'add_to_adjustment')::boolean, false);
      has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
      
      -- Skip entitlements without usage_allowed
      IF NOT usage_allowed THEN
        CONTINUE;
      END IF;
      
      -- Fetch current state with row lock
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
      WHERE ce.id = ent_id
      FOR UPDATE;

      -- Note: additional_balance was already processed in Pass 1, so we don't deduct from it here
      new_additional_balance := current_additional_balance;
      
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
          updates_json := jsonb_set(
            updates_json,
            ARRAY[ent_id],
            jsonb_build_object(
              'balance', new_balance,
              'additional_balance', new_additional_balance,
              'entities', new_entities,
              'adjustment', new_adjustment,
              'deducted', (updates_json->ent_id->>'deducted')::numeric + deducted,
              'additional_deducted', COALESCE((updates_json->ent_id->>'additional_deducted')::numeric, 0)
            )
          );
        ELSE
          -- Create new entry (entitlement only updated in Pass 2)
          updates_json := jsonb_set(
            updates_json,
            ARRAY[ent_id],
            jsonb_build_object(
              'balance', new_balance,
              'additional_balance', new_additional_balance,
              'entities', new_entities,
              'adjustment', new_adjustment,
              'deducted', deducted,
              'additional_deducted', 0
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

