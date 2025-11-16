-- Helper: Deduct from rollovers before deducting from main entitlements
DROP FUNCTION IF EXISTS deduct_from_rollovers(jsonb);

CREATE FUNCTION deduct_from_rollovers(params jsonb)
RETURNS TABLE(total_deducted numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  -- Extract parameters from JSONB
  rollover_ids text[] := CASE 
    WHEN params->'rollover_ids' IS NULL OR jsonb_typeof(params->'rollover_ids') != 'array' THEN ARRAY[]::text[]
    ELSE ARRAY(SELECT jsonb_array_elements_text(params->'rollover_ids'))
  END;
  amount_to_deduct numeric := (params->>'amount_to_deduct')::numeric;
  target_entity_id text := NULLIF(params->>'target_entity_id', '');
  has_entity_scope boolean := COALESCE((params->>'has_entity_scope')::boolean, false);
  

  -- Other variables
  remaining_amount numeric := amount_to_deduct;
  rollover_id text;
  current_balance numeric;
  current_usage numeric;
  current_entities jsonb;
  
  entity_key text;
  entity_balance numeric;
  entity_usage numeric;
  deduct_amount numeric;
  new_balance numeric;
  new_usage numeric;
  new_entities jsonb;
  rollover_total_deducted numeric := 0;
BEGIN
  -- Loop through rollover IDs in order
  FOREACH rollover_id IN ARRAY rollover_ids
  LOOP
    EXIT WHEN remaining_amount <= 0;
    
    -- Lock and fetch rollover data
    SELECT r.balance, COALESCE(r.usage, 0), r.entities
    INTO current_balance, current_usage, current_entities
    FROM rollovers r
    WHERE r.id = rollover_id
    FOR UPDATE;
    
    -- Handle entity-scoped rollovers (specific entity)
    IF has_entity_scope AND target_entity_id IS NOT NULL THEN
      entity_balance := COALESCE((current_entities->target_entity_id->>'balance')::numeric, 0);
      entity_usage := COALESCE((current_entities->target_entity_id->>'usage')::numeric, 0);
      
      -- Calculate deduction (always cap at 0)
      deduct_amount := LEAST(entity_balance, remaining_amount);
      
      IF deduct_amount > 0 THEN
        new_balance := entity_balance - deduct_amount;
        new_usage := entity_usage + deduct_amount;
        
        -- Update entity in JSONB
        new_entities := jsonb_set(
          current_entities,
          ARRAY[target_entity_id, 'balance'],
          to_jsonb(new_balance)
        );
        new_entities := jsonb_set(
          new_entities,
          ARRAY[target_entity_id, 'usage'],
          to_jsonb(new_usage)
        );
        
        -- Update rollover
        UPDATE rollovers r
        SET entities = new_entities
        WHERE r.id = rollover_id;
        
        remaining_amount := remaining_amount - deduct_amount;
        rollover_total_deducted := rollover_total_deducted + deduct_amount;
      END IF;
      
    -- Handle entity-scoped rollovers (deduct from all entities)
    ELSIF has_entity_scope AND target_entity_id IS NULL THEN
      new_entities := current_entities;
      deduct_amount := 0;
      
      FOR entity_key IN SELECT jsonb_object_keys(current_entities) ORDER BY 1
      LOOP
        EXIT WHEN remaining_amount <= 0;
        
        entity_balance := COALESCE((new_entities->entity_key->>'balance')::numeric, 0);
        entity_usage := COALESCE((new_entities->entity_key->>'usage')::numeric, 0);
        
        -- Calculate deduction for this entity (always cap at 0)
        deduct_amount := LEAST(entity_balance, remaining_amount);
        
        IF deduct_amount > 0 THEN
          new_balance := entity_balance - deduct_amount;
          new_usage := entity_usage + deduct_amount;
          
          new_entities := jsonb_set(
            new_entities,
            ARRAY[entity_key, 'balance'],
            to_jsonb(new_balance)
          );
          new_entities := jsonb_set(
            new_entities,
            ARRAY[entity_key, 'usage'],
            to_jsonb(new_usage)
          );
          
          remaining_amount := remaining_amount - deduct_amount;
          rollover_total_deducted := rollover_total_deducted + deduct_amount;
        END IF;
      END LOOP;
      
      -- Update rollover with all entity changes if any deductions occurred
      IF new_entities IS DISTINCT FROM current_entities THEN
        UPDATE rollovers r
        SET entities = new_entities
        WHERE r.id = rollover_id;
      END IF;
      
    -- Handle regular balance rollovers
    ELSE
      -- Calculate deduction (always cap at 0)
      deduct_amount := LEAST(current_balance, remaining_amount);
      
      IF deduct_amount > 0 THEN
        -- Update balance and usage atomically
        UPDATE rollovers r
        SET balance = balance - deduct_amount, usage = usage + deduct_amount
        WHERE r.id = rollover_id;
        
        remaining_amount := remaining_amount - deduct_amount;
        rollover_total_deducted := rollover_total_deducted + deduct_amount;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT rollover_total_deducted;
END;
$$;

