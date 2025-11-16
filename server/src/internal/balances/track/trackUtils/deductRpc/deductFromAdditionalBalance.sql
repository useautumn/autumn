-- Function: Handle additional_balance fields (deduct or add)
-- Handles both customer-level and entity-level additional_balance
-- Supports both positive remaining_amount (deduct) and negative remaining_amount (add)
-- Also updates additional_granted_balance when alter_granted_balance is true
-- Returns deducted/added amount and updated additional_balance values
DROP FUNCTION IF EXISTS deduct_from_additional_balance(jsonb);

CREATE FUNCTION deduct_from_additional_balance(params jsonb)
RETURNS TABLE (
  additional_deducted numeric,
  new_additional_balance numeric,
  new_additional_granted_balance numeric,
  new_entities jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  -- Extract parameters from JSONB
  current_additional_balance numeric := COALESCE((params->>'current_additional_balance')::numeric, 0);
  current_additional_granted_balance numeric := COALESCE((params->>'current_additional_granted_balance')::numeric, 0);
  current_entities jsonb := COALESCE(params->'current_entities', '{}'::jsonb);
  remaining_amount numeric := (params->>'remaining_amount')::numeric;
  credit_cost numeric := (params->>'credit_cost')::numeric;
  has_entity_scope boolean := COALESCE((params->>'has_entity_scope')::boolean, false);
  target_entity_id text := NULLIF(params->>'target_entity_id', '');
  skip_additional_balance boolean := COALESCE((params->>'skip_additional_balance')::boolean, false);
  alter_granted_balance boolean := COALESCE((params->>'alter_granted_balance')::boolean, false);
  
  total_additional_deducted numeric := 0;
  result_additional_balance numeric;
  result_additional_granted_balance numeric;
  result_entities jsonb;
  
  -- Variables for entity deduction
  remaining numeric;
  entity_key text;
  entity_additional_balance numeric;
  entity_additional_granted_balance numeric;
  additional_deductible numeric;
  entity_additional_deducted numeric;
  new_entity_additional_balance numeric;
  new_entity_additional_granted_balance numeric;
BEGIN
  -- Initialize return values
  result_additional_balance := current_additional_balance;
  result_additional_granted_balance := current_additional_granted_balance;
  result_entities := current_entities;
  
  -- Skip if flag is set or remaining_amount is zero
  IF skip_additional_balance OR remaining_amount = 0 THEN
    RETURN QUERY SELECT 0::numeric, result_additional_balance, result_additional_granted_balance, result_entities;
    RETURN;
  END IF;
  
  -- ============================================================================
  -- SECTION 1: Handle customer-level additional_balance (deduct or add)
  -- ============================================================================
  -- Customer-level additional_balance applies to both regular and entity-scoped features
  -- For entity-scoped features, it's shared across all entities
  -- Handles both positive (deduct) and negative (add) remaining_amount
  
  IF remaining_amount != 0 THEN
    -- Convert feature amount to credit amount
    additional_deductible := remaining_amount * credit_cost;
    
    IF remaining_amount > 0 THEN
      -- Deducting: limit to available balance
      additional_deductible := LEAST(additional_deductible, result_additional_balance);
      
      IF additional_deductible > 0 THEN
        -- Deduct from customer-level additional_balance
        result_additional_balance := result_additional_balance - additional_deductible;
        -- If alter_granted_balance is true, also deduct from additional_granted_balance
        IF alter_granted_balance THEN
          result_additional_granted_balance := result_additional_granted_balance - additional_deductible;
        END IF;
        -- Convert back to feature amount for tracking
        total_additional_deducted := additional_deductible / credit_cost;
        remaining_amount := remaining_amount - total_additional_deducted;
      END IF;
    ELSE
      -- Adding: subtract negative amount (which adds)
      result_additional_balance := result_additional_balance - additional_deductible;
      -- If alter_granted_balance is true, also add to additional_granted_balance
      IF alter_granted_balance THEN
        result_additional_granted_balance := result_additional_granted_balance - additional_deductible;
      END IF;
      -- Convert back to feature amount for tracking (will be negative)
      total_additional_deducted := additional_deductible / credit_cost;
      remaining_amount := remaining_amount - total_additional_deducted;
    END IF;
  END IF;
  
  -- ============================================================================
  -- SECTION 2: Handle entity-level additional_balance (entity-scoped only)
  -- ============================================================================
  -- Entity-level additional_balance is stored per-entity in the entities JSONB
  -- Handles both positive (deduct) and negative (add) remaining_amount
  
  IF has_entity_scope AND remaining_amount != 0 THEN
    IF target_entity_id IS NOT NULL THEN
      -- ========================================================================
      -- Specific Entity Mode: Handle one entity's additional_balance
      -- ========================================================================
      entity_additional_balance := COALESCE((result_entities->target_entity_id->>'additional_balance')::numeric, 0);
      entity_additional_granted_balance := COALESCE((result_entities->target_entity_id->>'additional_granted_balance')::numeric, 0);
      
      -- Convert feature amount to credit amount
      additional_deductible := remaining_amount * credit_cost;
      
      IF remaining_amount > 0 THEN
        -- Deducting: limit to available balance
        additional_deductible := LEAST(additional_deductible, entity_additional_balance);
        
        IF additional_deductible > 0 THEN
          -- Deduct from entity-level additional_balance
          new_entity_additional_balance := entity_additional_balance - additional_deductible;
          result_entities := jsonb_set(
            result_entities,
            ARRAY[target_entity_id, 'additional_balance'],
            to_jsonb(new_entity_additional_balance)
          );
          -- If alter_granted_balance is true, also deduct from entity-level additional_granted_balance
          IF alter_granted_balance THEN
            new_entity_additional_granted_balance := entity_additional_granted_balance - additional_deductible;
            result_entities := jsonb_set(
              result_entities,
              ARRAY[target_entity_id, 'additional_granted_balance'],
              to_jsonb(new_entity_additional_granted_balance)
            );
          END IF;
          -- Convert back to feature amount and add to total
          entity_additional_deducted := additional_deductible / credit_cost;
          total_additional_deducted := total_additional_deducted + entity_additional_deducted;
          remaining_amount := remaining_amount - entity_additional_deducted;
        END IF;
      ELSE
        -- Adding: subtract negative amount (which adds)
        new_entity_additional_balance := entity_additional_balance - additional_deductible;
        result_entities := jsonb_set(
          result_entities,
          ARRAY[target_entity_id, 'additional_balance'],
          to_jsonb(new_entity_additional_balance)
        );
        -- If alter_granted_balance is true, also add to entity-level additional_granted_balance
        IF alter_granted_balance THEN
          new_entity_additional_granted_balance := entity_additional_granted_balance - additional_deductible;
          result_entities := jsonb_set(
            result_entities,
            ARRAY[target_entity_id, 'additional_granted_balance'],
            to_jsonb(new_entity_additional_granted_balance)
          );
        END IF;
        -- Convert back to feature amount (will be negative) and add to total
        entity_additional_deducted := additional_deductible / credit_cost;
        total_additional_deducted := total_additional_deducted + entity_additional_deducted;
        remaining_amount := remaining_amount - entity_additional_deducted;
      END IF;
    ELSE
      -- ========================================================================
      -- All Entities Mode: Handle all entities' additional_balance
      -- ========================================================================
      -- Iterate through entities in sorted order (for consistency with Redis)
      remaining := remaining_amount * credit_cost;
      
      FOR entity_key IN SELECT jsonb_object_keys(result_entities) ORDER BY 1
      LOOP
        EXIT WHEN remaining = 0;
        
        entity_additional_balance := COALESCE((result_entities->entity_key->>'additional_balance')::numeric, 0);
        entity_additional_granted_balance := COALESCE((result_entities->entity_key->>'additional_granted_balance')::numeric, 0);
        
        IF remaining > 0 THEN
          -- Deducting: limit to available balance
          additional_deductible := LEAST(remaining, entity_additional_balance);
          
          IF additional_deductible > 0 THEN
            -- Deduct from entity-level additional_balance
            new_entity_additional_balance := entity_additional_balance - additional_deductible;
            result_entities := jsonb_set(
              result_entities,
              ARRAY[entity_key, 'additional_balance'],
              to_jsonb(new_entity_additional_balance)
            );
            -- If alter_granted_balance is true, also deduct from entity-level additional_granted_balance
            IF alter_granted_balance THEN
              new_entity_additional_granted_balance := entity_additional_granted_balance - additional_deductible;
              result_entities := jsonb_set(
                result_entities,
                ARRAY[entity_key, 'additional_granted_balance'],
                to_jsonb(new_entity_additional_granted_balance)
              );
            END IF;
            -- Track deduction and reduce remaining
            remaining := remaining - additional_deductible;
            entity_additional_deducted := additional_deductible / credit_cost;
            total_additional_deducted := total_additional_deducted + entity_additional_deducted;
          END IF;
        ELSE
          -- Adding: subtract negative amount (which adds) - apply to all remaining
          new_entity_additional_balance := entity_additional_balance - remaining;
          result_entities := jsonb_set(
            result_entities,
            ARRAY[entity_key, 'additional_balance'],
            to_jsonb(new_entity_additional_balance)
          );
          -- If alter_granted_balance is true, also add to entity-level additional_granted_balance
          IF alter_granted_balance THEN
            new_entity_additional_granted_balance := entity_additional_granted_balance - remaining;
            result_entities := jsonb_set(
              result_entities,
              ARRAY[entity_key, 'additional_granted_balance'],
              to_jsonb(new_entity_additional_granted_balance)
            );
          END IF;
          -- Track addition and reduce remaining (will become 0 after first entity)
          entity_additional_deducted := remaining / credit_cost;
          total_additional_deducted := total_additional_deducted + entity_additional_deducted;
          remaining := 0;
        END IF;
      END LOOP;
    END IF;
  END IF;
  
  -- Return results
  RETURN QUERY SELECT total_additional_deducted, result_additional_balance, result_additional_granted_balance, result_entities;
END;
$$;

