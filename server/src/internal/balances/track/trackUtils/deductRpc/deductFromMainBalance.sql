-- Helper function: Perform deduction calculation for a single entitlement
-- This handles both entity-scoped and regular balance deductions
DROP FUNCTION IF EXISTS deduct_from_main_balance(numeric, jsonb, numeric, numeric, numeric, boolean, boolean, text, numeric, boolean);

CREATE FUNCTION deduct_from_main_balance(
  -- Current state
  current_balance numeric,
  current_entities jsonb,
  current_adjustment numeric,
  
  -- Deduction parameters
  amount_to_deduct numeric,
  credit_cost numeric,
  
  -- Behavior flags
  allow_negative boolean,        -- false for Pass 1 (to zero), true for Pass 2 (can go negative)
  has_entity_scope boolean,
  target_entity_id text,
  min_balance numeric,
  add_to_adjustment boolean
)
RETURNS TABLE (
  deducted numeric,
  new_balance numeric,
  new_entities jsonb,
  new_adjustment numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  deducted_amount numeric := 0;
  result_balance numeric;
  result_entities jsonb;
  result_adjustment numeric;
  
  -- Variables for entity deduction
  remaining numeric;
  entity_key text;
  entity_balance numeric;
  entity_adjustment numeric;
  deduct_amount numeric;
  new_balance numeric;
  new_adjustment numeric;
BEGIN
  
  -- ============================================================================
  -- CASE 1: ENTITY-SCOPED - ALL ENTITIES (no specific entity_id)
  -- ============================================================================
  IF has_entity_scope AND target_entity_id IS NULL THEN
    remaining := amount_to_deduct * credit_cost;
    result_entities := current_entities;
    deducted_amount := 0;
    
    -- Loop through all entities and deduct iteratively
    FOR entity_key IN SELECT jsonb_object_keys(current_entities)
    LOOP
      EXIT WHEN remaining = 0;
      
      entity_balance := COALESCE((result_entities->entity_key->>'balance')::numeric, 0);
      entity_adjustment := COALESCE((result_entities->entity_key->>'adjustment')::numeric, 0);
      
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
        
        -- Update adjustment if needed
        IF add_to_adjustment THEN
          new_adjustment := entity_adjustment + deduct_amount;
          result_entities := jsonb_set(
            result_entities,
            ARRAY[entity_key, 'adjustment'],
            to_jsonb(new_adjustment)
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
    entity_adjustment := COALESCE((current_entities->target_entity_id->>'adjustment')::numeric, 0);
    
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
      
      -- Update adjustment if needed
      IF add_to_adjustment THEN
        new_adjustment := entity_adjustment + deducted_amount;
        result_entities := jsonb_set(
          result_entities,
          ARRAY[target_entity_id, 'adjustment'],
          to_jsonb(new_adjustment)
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
  END IF;
  
  -- Calculate new adjustment if needed
  IF add_to_adjustment THEN
    result_adjustment := current_adjustment + deducted_amount;
  ELSE
    result_adjustment := current_adjustment;
  END IF;
  
  -- Return results
  RETURN QUERY SELECT deducted_amount, result_balance, result_entities, result_adjustment;
END;
$$;

