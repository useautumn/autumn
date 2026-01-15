-- Sync balances from Redis to Postgres
-- Direct sync approach: sets target values instead of calculating deltas
--
-- Params (JSONB):
--   entitlements: array of objects with:
--     - customer_entitlement_id: string
--     - target_balance: number (optional) - the backend balance to set
--     - target_adjustment: number (optional) - the adjustment value (granted_balance - starting_balance)
--     - entity_feature_id: string (optional) - indicates entity-scoped entitlement
--     - target_entity_id: string (optional) - for entity-scoped balances, the entity ID to update
--
-- Returns JSONB with:
--   updates: object mapping customer_entitlement_id -> update result
--
DROP FUNCTION IF EXISTS sync_balances(jsonb);

CREATE FUNCTION sync_balances(params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  -- Extract parameters from JSONB
  entitlements jsonb := params->'entitlements';
  
  -- Loop variables
  ent_obj jsonb;
  ent_id text;
  target_balance numeric;
  target_adjustment numeric;
  has_entity_scope boolean;
  target_entity_id text;
  
  -- Current state from DB
  current_balance numeric;
  current_adjustment numeric;
  current_entities jsonb;
  
  -- New state
  new_balance numeric;
  new_adjustment numeric;
  new_entities jsonb;
  
  -- Result tracking
  updates_json jsonb := '{}'::jsonb;
  cus_ent_ids text[];
BEGIN
  -- ============================================================================
  -- STEP 0: Extract all customer_entitlement_ids and lock rows upfront
  -- ============================================================================
  
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(
      jsonb_path_query_array(entitlements, '$[*].customer_entitlement_id')
    )
  ) INTO cus_ent_ids;
  
  IF cus_ent_ids IS NOT NULL AND array_length(cus_ent_ids, 1) > 0 THEN
    PERFORM 1 FROM customer_entitlements ce WHERE ce.id = ANY(cus_ent_ids) FOR UPDATE;
  END IF;
  
  -- ============================================================================
  -- STEP 1: Iterate through entitlements and sync each one
  -- ============================================================================
  
  FOR ent_obj IN SELECT * FROM jsonb_array_elements(entitlements)
  LOOP
    -- Extract entitlement properties
    ent_id := ent_obj->>'customer_entitlement_id';
    target_balance := (ent_obj->>'target_balance')::numeric;
    target_adjustment := (ent_obj->>'target_adjustment')::numeric;
    has_entity_scope := (ent_obj->>'entity_feature_id') IS NOT NULL;
    target_entity_id := NULLIF(ent_obj->>'target_entity_id', '');
    
    -- Fetch current state from DB
    SELECT
      ce.balance,
      COALESCE(ce.adjustment, 0),
      COALESCE(ce.entities, '{}'::jsonb)
    INTO
      current_balance,
      current_adjustment,
      current_entities
    FROM customer_entitlements ce
    WHERE ce.id = ent_id;
    
    -- Skip if entitlement not found
    IF current_balance IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Initialize new values
    new_balance := current_balance;
    new_adjustment := current_adjustment;
    new_entities := current_entities;
    
    -- ============================================================================
    -- CASE 1: ENTITY-SCOPED (requires specific target_entity_id)
    -- ============================================================================
    IF has_entity_scope THEN
      -- Skip if target_entity_id is null (can't update entity balance without entity ID)
      IF target_entity_id IS NULL THEN
        CONTINUE;
      END IF;
      
      IF target_balance IS NOT NULL THEN
        new_entities := jsonb_set(
          new_entities,
          ARRAY[target_entity_id, 'balance'],
          to_jsonb(target_balance)
        );
      END IF;
      
      IF target_adjustment IS NOT NULL THEN
        new_entities := jsonb_set(
          new_entities,
          ARRAY[target_entity_id, 'adjustment'],
          to_jsonb(target_adjustment)
        );
      END IF;
      
    -- ============================================================================
    -- CASE 2: TOP-LEVEL BALANCE (no entity scope)
    -- ============================================================================
    ELSE
      IF target_balance IS NOT NULL THEN
        new_balance := target_balance;
      END IF;
      
      IF target_adjustment IS NOT NULL THEN
        new_adjustment := target_adjustment;
      END IF;
    END IF;
    
    -- ============================================================================
    -- STEP 2: Update database
    -- ============================================================================
    
    IF has_entity_scope THEN
      UPDATE customer_entitlements ce
      SET
        entities = new_entities
      WHERE ce.id = ent_id;
    ELSE
      UPDATE customer_entitlements ce
      SET
        balance = new_balance,
        adjustment = new_adjustment
      WHERE ce.id = ent_id;
    END IF;
    
    -- Track update in result
    updates_json := jsonb_set(
      updates_json,
      ARRAY[ent_id],
      jsonb_build_object(
        'balance', new_balance,
        'adjustment', new_adjustment,
        'entities', new_entities
      )
    );
    
  END LOOP;
  
  -- Return result
  RETURN jsonb_build_object('updates', updates_json);
END;
$$;

