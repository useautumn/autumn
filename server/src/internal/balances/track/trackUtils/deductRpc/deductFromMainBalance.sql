-- Helper function: Perform deduction calculation for a single entitlement
-- This handles both entity-scoped and regular balance deductions
DROP FUNCTION IF EXISTS deduct_from_main_balance(jsonb);

CREATE FUNCTION deduct_from_main_balance(params jsonb)
RETURNS TABLE (
  deducted numeric,
  new_balance numeric,
  new_entities jsonb,
  new_adjustment numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  -- Extract parameters from JSONB
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
        -- Adding credits: deduct the entire negative amount (which adds)
        deduct_amount := remaining;
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
      -- Adding credits: deduct the entire negative amount (which adds)
      deducted_amount := amount_to_deduct * credit_cost;
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
      -- Adding credits: deduct the entire negative amount (which adds)
      deducted_amount := amount_to_deduct * credit_cost;
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
  END IF;
  
  -- Return results
  RETURN QUERY SELECT deducted_amount, result_balance, result_entities, result_adjustment;
END;
$$;

