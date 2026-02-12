-- Helper: Deduct from rollovers before deducting from main entitlements
-- Supports new 'rollovers' array with credit_cost, falls back to 'rollover_ids' (credit_cost=1)
-- Returns: total_deducted in FEATURE units (not credit units) so caller can subtract directly from remaining_amount
DROP FUNCTION IF EXISTS deduct_from_rollovers(jsonb);

CREATE FUNCTION deduct_from_rollovers(params jsonb)
RETURNS TABLE(total_deducted numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  -- Extract parameters from JSONB
  rollovers_arr jsonb;
  rollover_ids text[];
  amount_to_deduct numeric := (params->>'amount_to_deduct')::numeric;
  target_entity_id text := NULLIF(params->>'target_entity_id', '');
  has_entity_scope boolean := COALESCE((params->>'has_entity_scope')::boolean, false);
  
  -- Other variables
  remaining_amount numeric := amount_to_deduct;
  rollover_obj jsonb;
  rollover_id text;
  credit_cost numeric;
  current_balance numeric;
  current_usage numeric;
  current_entities jsonb;
  
  entity_key text;
  entity_balance numeric;
  entity_usage numeric;
  credit_deduct_amount numeric;
  feature_deduct_amount numeric;
  new_balance numeric;
  new_usage numeric;
  new_entities jsonb;
  rollover_total_deducted_features numeric := 0;
BEGIN
  -- Normalize input: if rollovers array provided use it, otherwise convert rollover_ids to same format
  IF params->'rollovers' IS NOT NULL AND jsonb_typeof(params->'rollovers') = 'array' AND jsonb_array_length(params->'rollovers') > 0 THEN
    rollovers_arr := params->'rollovers';
  ELSIF params->'rollover_ids' IS NOT NULL AND jsonb_typeof(params->'rollover_ids') = 'array' THEN
    -- Convert rollover_ids string array to rollovers object array with credit_cost = 1
    rollover_ids := ARRAY(SELECT jsonb_array_elements_text(params->'rollover_ids'));
    SELECT jsonb_agg(jsonb_build_object('id', id, 'credit_cost', 1))
    INTO rollovers_arr
    FROM unnest(rollover_ids) AS id;
  ELSE
    -- No rollovers to process
    RETURN QUERY SELECT 0::numeric;
    RETURN;
  END IF;
  
  -- Early return if no amount
  IF remaining_amount <= 0 THEN
    RETURN QUERY SELECT 0::numeric;
    RETURN;
  END IF;

  -- Loop through rollovers array (each element has id and credit_cost)
  FOR rollover_obj IN SELECT * FROM jsonb_array_elements(rollovers_arr)
  LOOP
    EXIT WHEN remaining_amount <= 0;
    
    rollover_id := rollover_obj->>'id';
    credit_cost := COALESCE((rollover_obj->>'credit_cost')::numeric, 1);
    
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
      
      -- Calculate: credits needed = remaining_amount * credit_cost
      -- Actual deduction = min(available_balance, credits_needed)
      credit_deduct_amount := LEAST(entity_balance, remaining_amount * credit_cost);
      
      IF credit_deduct_amount > 0 THEN
        new_balance := entity_balance - credit_deduct_amount;
        new_usage := entity_usage + credit_deduct_amount;
        
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
        
        UPDATE rollovers r
        SET entities = new_entities
        WHERE r.id = rollover_id;
        
        feature_deduct_amount := credit_deduct_amount / credit_cost;
        remaining_amount := remaining_amount - feature_deduct_amount;
        rollover_total_deducted_features := rollover_total_deducted_features + feature_deduct_amount;
      END IF;
      
    -- Handle entity-scoped rollovers (deduct from all entities)
    ELSIF has_entity_scope AND target_entity_id IS NULL THEN
      new_entities := current_entities;
      
      FOR entity_key IN SELECT jsonb_object_keys(current_entities) ORDER BY 1
      LOOP
        EXIT WHEN remaining_amount <= 0;
        
        entity_balance := COALESCE((new_entities->entity_key->>'balance')::numeric, 0);
        entity_usage := COALESCE((new_entities->entity_key->>'usage')::numeric, 0);
        
        credit_deduct_amount := LEAST(entity_balance, remaining_amount * credit_cost);
        
        IF credit_deduct_amount > 0 THEN
          new_balance := entity_balance - credit_deduct_amount;
          new_usage := entity_usage + credit_deduct_amount;
          
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
          
          feature_deduct_amount := credit_deduct_amount / credit_cost;
          remaining_amount := remaining_amount - feature_deduct_amount;
          rollover_total_deducted_features := rollover_total_deducted_features + feature_deduct_amount;
        END IF;
      END LOOP;
      
      IF new_entities IS DISTINCT FROM current_entities THEN
        UPDATE rollovers r
        SET entities = new_entities
        WHERE r.id = rollover_id;
      END IF;
      
    -- Handle regular balance rollovers
    ELSE
      credit_deduct_amount := LEAST(current_balance, remaining_amount * credit_cost);
      
      IF credit_deduct_amount > 0 THEN
        UPDATE rollovers r
        SET balance = balance - credit_deduct_amount, usage = usage + credit_deduct_amount
        WHERE r.id = rollover_id;
        
        feature_deduct_amount := credit_deduct_amount / credit_cost;
        remaining_amount := remaining_amount - feature_deduct_amount;
        rollover_total_deducted_features := rollover_total_deducted_features + feature_deduct_amount;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT rollover_total_deducted_features;
END;
$$;
