-- Function: Get total balance across all entitlements and rollovers
-- Includes additional_balance fields (both customer-level and entity-level)
-- Returns the total available balance for sync operations

DROP FUNCTION IF EXISTS get_total_balance(jsonb);

CREATE FUNCTION get_total_balance(params jsonb)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  -- Extract parameters from JSONB
  sorted_entitlements jsonb := params->'sorted_entitlements';
  target_entity_id text := NULLIF(params->>'target_entity_id', '');
  rollover_ids text[] := CASE 
    WHEN params->'rollover_ids' IS NULL OR jsonb_typeof(params->'rollover_ids') != 'array' THEN NULL
    ELSE ARRAY(SELECT jsonb_array_elements_text(params->'rollover_ids'))
  END;
  
  total_balance numeric := 0;
  ent_obj jsonb;
  ent_id text;
  has_entity_scope boolean;
  
  -- Current state from DB
  current_balance numeric;
  current_additional_balance numeric;
  current_entities jsonb;
  
  -- For entity calculations
  entity_key text;
  entity_balance numeric;
  entity_additional_balance numeric;
  
  -- For rollover calculations
  rollover_balance numeric;
BEGIN
  -- ============================================================================
  -- SECTION 1: Sum balance across all entitlements
  -- ============================================================================
  -- Iterates through each entitlement and calculates its contribution to total balance
  -- Handles both regular features and entity-scoped features
  -- Includes additional_balance fields at both customer and entity levels
  
  FOR ent_obj IN SELECT * FROM jsonb_array_elements(sorted_entitlements)
  LOOP
    ent_id := ent_obj->>'customer_entitlement_id';
    has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
    
    SELECT 
      ce.balance, 
      COALESCE(ce.additional_balance, 0),
      COALESCE(ce.entities, '{}'::jsonb)
    INTO 
      current_balance, 
      current_additional_balance,
      current_entities
    FROM customer_entitlements ce
    WHERE ce.id = ent_id;
    
    IF has_entity_scope THEN
      IF target_entity_id IS NOT NULL THEN
        entity_balance := COALESCE((current_entities->target_entity_id->>'balance')::numeric, 0);
        entity_additional_balance := COALESCE((current_entities->target_entity_id->>'additional_balance')::numeric, 0);
        total_balance := total_balance + entity_balance + entity_additional_balance + current_additional_balance;
      ELSE
        FOR entity_key IN SELECT jsonb_object_keys(current_entities) ORDER BY 1
        LOOP
          entity_balance := COALESCE((current_entities->entity_key->>'balance')::numeric, 0);
          entity_additional_balance := COALESCE((current_entities->entity_key->>'additional_balance')::numeric, 0);
          total_balance := total_balance + entity_balance + entity_additional_balance;
        END LOOP;
        total_balance := total_balance + current_additional_balance;
      END IF;
    ELSE
      total_balance := total_balance + GREATEST(0, current_balance) + current_additional_balance;
    END IF;
  END LOOP;
  
  -- ============================================================================
  -- SECTION 2: Sum balance across all rollovers
  -- ============================================================================
  -- Rollovers represent unused balance from previous periods that has rolled over
  -- Rollovers don't have additional_balance fields (only balance and usage)
  -- Uses the first entitlement's scope to determine if rollovers are entity-scoped
  
  IF rollover_ids IS NOT NULL AND array_length(rollover_ids, 1) > 0 THEN
    SELECT * INTO ent_obj FROM jsonb_array_elements(sorted_entitlements) LIMIT 1;
    has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
    
    FOR ent_id IN SELECT unnest(rollover_ids)
    LOOP
      IF has_entity_scope THEN
        SELECT COALESCE(r.entities, '{}'::jsonb)
        INTO current_entities
        FROM rollovers r
        WHERE r.id = ent_id;
        
        IF target_entity_id IS NOT NULL THEN
          entity_balance := COALESCE((current_entities->target_entity_id->>'balance')::numeric, 0);
          total_balance := total_balance + entity_balance;
        ELSE
          FOR entity_key IN SELECT jsonb_object_keys(current_entities) ORDER BY 1
          LOOP
            entity_balance := COALESCE((current_entities->entity_key->>'balance')::numeric, 0);
            total_balance := total_balance + entity_balance;
          END LOOP;
        END IF;
      ELSE
        SELECT COALESCE(r.balance, 0)
        INTO rollover_balance
        FROM rollovers r
        WHERE r.id = ent_id;
        
        total_balance := total_balance + rollover_balance;
      END IF;
    END LOOP;
  END IF;
  
  RETURN total_balance;
END;
$$;

