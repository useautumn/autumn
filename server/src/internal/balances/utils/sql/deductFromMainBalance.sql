-- Helper function: Perform deduction calculation for a single entitlement
-- This handles both entity-scoped and regular balance deductions
DROP FUNCTION IF EXISTS deduct_from_main_balance(jsonb);

CREATE FUNCTION deduct_from_main_balance(params jsonb)
RETURNS TABLE (
  deducted numeric,
  new_balance numeric,
  new_entities jsonb,
  new_adjustment numeric,
  mutation_logs jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  -- Extract parameters from JSONB
  customer_entitlement_id text := NULLIF(params->>'customer_entitlement_id', '');
  current_balance numeric := (params->>'current_balance')::numeric;
  current_entities jsonb := COALESCE(params->'current_entities', '{}'::jsonb);
  current_adjustment numeric := COALESCE((params->>'current_adjustment')::numeric, 0);
  amount_to_deduct numeric := (params->>'amount_to_deduct')::numeric;
  credit_cost numeric := (params->>'credit_cost')::numeric;
  allow_negative boolean := COALESCE((params->>'allow_negative')::boolean, false);
  has_entity_scope boolean := COALESCE((params->>'has_entity_scope')::boolean, false);
  target_entity_id text := NULLIF(params->>'target_entity_id', '');
  min_balance numeric := CASE 
    WHEN params->>'min_balance' IS NULL THEN NULL
    ELSE (params->>'min_balance')::numeric
  END;
  alter_granted_balance boolean := COALESCE((params->>'alter_granted_balance')::boolean, false);
  overage_behavior_is_allow boolean := COALESCE((params->>'overage_behavior_is_allow')::boolean, false);
  max_balance numeric := CASE 
    WHEN params->>'max_balance' IS NULL THEN NULL
    ELSE (params->>'max_balance')::numeric
  END;
  
  deducted_amount numeric := 0;
  result_balance numeric;
  result_entities jsonb;
  result_adjustment numeric;
  
  -- Variables for entity deduction
  remaining numeric;
  entity_key text;
  entity_balance numeric;
  deduct_amount numeric;
  new_balance numeric;
  
  -- Variables for ceiling calculation (negative track)
  entity_adjustment numeric;
  ceiling numeric;
  max_addable numeric;
  mutation_logs_json jsonb := '[]'::jsonb;
BEGIN
  
  -- Initialize return values
  result_adjustment := current_adjustment;
  
  -- ============================================================================
  -- CASE 1: ENTITY-SCOPED - ALL ENTITIES (no specific entity_id)
  -- ============================================================================
  IF has_entity_scope AND target_entity_id IS NULL THEN
    remaining := amount_to_deduct * credit_cost;
    result_entities := current_entities;
    deducted_amount := 0;
    
    -- Loop through all entities and deduct iteratively (sorted for consistency with Redis)
    FOR entity_key IN SELECT jsonb_object_keys(current_entities) ORDER BY 1
    LOOP
      EXIT WHEN remaining = 0;
      
      entity_balance := COALESCE((result_entities->entity_key->>'balance')::numeric, 0);
      
      -- Calculate deduction respecting allow_negative and min_balance
      -- Handle negative amounts (adding credits) differently
      IF remaining < 0 THEN
        -- Adding credits: apply ceiling if overage_behavior_is_allow is false and max_balance exists
        IF NOT overage_behavior_is_allow AND max_balance IS NOT NULL THEN
          -- Get entity-level adjustment
          entity_adjustment := COALESCE((result_entities->entity_key->>'adjustment')::numeric, 0);
          -- Compute ceiling: max_balance + adjustment
          ceiling := max_balance + entity_adjustment;
          -- Cap addition so balance doesn't exceed ceiling
          max_addable := GREATEST(0, ceiling - entity_balance);
          -- remaining is negative, so -remaining is the amount to add
          -- deduct_amount will be negative (adding to balance)
          deduct_amount := -LEAST(-remaining, max_addable);
        ELSE
          -- No ceiling: deduct the entire negative amount (which adds)
          deduct_amount := remaining;
        END IF;
      ELSIF allow_negative THEN
        IF min_balance IS NULL THEN
          deduct_amount := remaining;
        ELSE
          deduct_amount := LEAST(remaining, entity_balance - min_balance);
        END IF;
      ELSE
        deduct_amount := LEAST(entity_balance, remaining);
      END IF;
      
      IF deduct_amount != 0 THEN
        new_balance := entity_balance - deduct_amount;
        result_entities := jsonb_set(
          result_entities,
          ARRAY[entity_key, 'balance'],
          to_jsonb(new_balance)
        );
        
        -- If alter_granted_balance is true, update adjustment field to track the change
        IF alter_granted_balance THEN
          result_entities := jsonb_set(
            result_entities,
            ARRAY[entity_key, 'adjustment'],
            to_jsonb(COALESCE((result_entities->entity_key->>'adjustment')::numeric, 0) - deduct_amount)
          );
        END IF;

        mutation_logs_json := mutation_logs_json || jsonb_build_array(
          jsonb_build_object(
            'target_type', 'customer_entitlement',
            'customer_entitlement_id', customer_entitlement_id,
            'rollover_id', NULL,
            'entity_id', entity_key,
            'credit_cost', credit_cost,
            'balance_delta', -deduct_amount,
            'adjustment_delta', CASE WHEN alter_granted_balance THEN -deduct_amount ELSE 0 END,
            'usage_delta', 0,
            'value_delta', deduct_amount / credit_cost
          )
        );
        
        remaining := remaining - deduct_amount;
        deducted_amount := deducted_amount + deduct_amount;
      END IF;
    END LOOP;
    
    result_balance := current_balance;  -- Top-level balance unchanged for entity-scoped
    
  -- ============================================================================
  -- CASE 2: ENTITY-SCOPED - SINGLE ENTITY (specific entity_id provided)
  -- ============================================================================
  ELSIF has_entity_scope AND target_entity_id IS NOT NULL THEN
    entity_balance := COALESCE((current_entities->target_entity_id->>'balance')::numeric, 0);
    
    -- Calculate deduction respecting allow_negative and min_balance
    -- Handle negative amounts (adding credits) differently
    IF amount_to_deduct < 0 THEN
      -- Adding credits: apply ceiling if overage_behavior_is_allow is false and max_balance exists
      IF NOT overage_behavior_is_allow AND max_balance IS NOT NULL THEN
        -- Get entity-level adjustment
        entity_adjustment := COALESCE((current_entities->target_entity_id->>'adjustment')::numeric, 0);
        -- Compute ceiling: max_balance + adjustment
        ceiling := max_balance + entity_adjustment;
        -- Cap addition so balance doesn't exceed ceiling
        max_addable := GREATEST(0, ceiling - entity_balance);
        -- amount_to_deduct is negative, so -amount_to_deduct is the amount to add
        -- deducted_amount will be negative (adding to balance)
        deducted_amount := -LEAST(-amount_to_deduct * credit_cost, max_addable);
      ELSE
        -- No ceiling: deduct the entire negative amount (which adds)
        deducted_amount := amount_to_deduct * credit_cost;
      END IF;
    ELSIF allow_negative THEN
      IF min_balance IS NULL THEN
        deducted_amount := amount_to_deduct * credit_cost;
      ELSE
        deducted_amount := LEAST(amount_to_deduct * credit_cost, entity_balance - min_balance);
      END IF;
    ELSE
      deducted_amount := LEAST(entity_balance, amount_to_deduct * credit_cost);
    END IF;
    
    IF deducted_amount != 0 THEN
      new_balance := entity_balance - deducted_amount;
      result_entities := jsonb_set(
        current_entities,
        ARRAY[target_entity_id, 'balance'],
        to_jsonb(new_balance)
      );
      
      -- If alter_granted_balance is true, update adjustment field to track the change
      IF alter_granted_balance THEN
        result_entities := jsonb_set(
          result_entities,
          ARRAY[target_entity_id, 'adjustment'],
          to_jsonb(COALESCE((result_entities->target_entity_id->>'adjustment')::numeric, 0) - deducted_amount)
        );
      END IF;

      mutation_logs_json := mutation_logs_json || jsonb_build_array(
        jsonb_build_object(
          'target_type', 'customer_entitlement',
          'customer_entitlement_id', customer_entitlement_id,
          'rollover_id', NULL,
          'entity_id', target_entity_id,
          'credit_cost', credit_cost,
          'balance_delta', -deducted_amount,
          'adjustment_delta', CASE WHEN alter_granted_balance THEN -deducted_amount ELSE 0 END,
          'usage_delta', 0,
          'value_delta', deducted_amount / credit_cost
        )
      );
    ELSE
      result_entities := current_entities;
    END IF;
    
    result_balance := current_balance;  -- Top-level balance unchanged for entity-scoped
    
  -- ============================================================================
  -- CASE 3: TOP-LEVEL BALANCE (no entity scope)
  -- ============================================================================
  ELSE
    -- Calculate deduction based on allow_negative flag
    -- Handle negative amounts (adding credits) differently
    IF amount_to_deduct < 0 THEN
      -- Adding credits: apply ceiling if overage_behavior_is_allow is false and max_balance exists
      IF NOT overage_behavior_is_allow AND max_balance IS NOT NULL THEN
        -- Compute ceiling: max_balance + current_adjustment (customer-level)
        ceiling := max_balance + current_adjustment;
        -- Cap addition so balance doesn't exceed ceiling
        max_addable := GREATEST(0, ceiling - current_balance);
        -- amount_to_deduct is negative, so -amount_to_deduct is the amount to add
        -- deducted_amount will be negative (adding to balance)
        deducted_amount := -LEAST(-amount_to_deduct * credit_cost, max_addable);
      ELSE
        -- No ceiling: deduct the entire negative amount (which adds)
        deducted_amount := amount_to_deduct * credit_cost;
      END IF;
    ELSIF allow_negative THEN
      -- Pass 2: Can go negative (respecting min_balance)
      IF min_balance IS NULL THEN
        deducted_amount := amount_to_deduct * credit_cost;
      ELSE
        deducted_amount := LEAST(amount_to_deduct * credit_cost, current_balance - min_balance);
      END IF;
    ELSE
      -- Pass 1: Only deduct down to zero
      deducted_amount := LEAST(current_balance, amount_to_deduct * credit_cost);
    END IF;
    
    result_balance := current_balance - deducted_amount;
    result_entities := current_entities;  -- Entities unchanged for non-entity-scoped
    
    -- If alter_granted_balance is true, update adjustment field to track the change
    IF alter_granted_balance THEN
      result_adjustment := result_adjustment - deducted_amount;
    END IF;

    IF deducted_amount != 0 THEN
      mutation_logs_json := mutation_logs_json || jsonb_build_array(
        jsonb_build_object(
          'target_type', 'customer_entitlement',
          'customer_entitlement_id', customer_entitlement_id,
          'rollover_id', NULL,
          'entity_id', NULL,
          'credit_cost', credit_cost,
          'balance_delta', -deducted_amount,
          'adjustment_delta', CASE WHEN alter_granted_balance THEN -deducted_amount ELSE 0 END,
          'usage_delta', 0,
          'value_delta', deducted_amount / credit_cost
        )
      );
    END IF;
  END IF;
  
  -- Return results
  RETURN QUERY
  SELECT
    deducted_amount,
    result_balance,
    result_entities,
    result_adjustment,
    mutation_logs_json;
END;
$$;
