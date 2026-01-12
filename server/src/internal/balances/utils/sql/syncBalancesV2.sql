-- Sync balances from Redis cache to Postgres (V2 - simplified)
--
-- Params (JSONB):
--   customer_entitlement_updates: array of objects with:
--     - customer_entitlement_id: string
--     - balance: number
--     - adjustment: number
--     - entities: jsonb (the full entities object)
--     - next_reset_at: bigint/number (unix timestamp, for conflict detection)
--     - entity_count: number (for conflict detection)
--   rollover_updates: array of objects with:
--     - rollover_id: string
--     - balance: number
--     - usage: number
--     - entities: jsonb (the full entities object)
--
-- Returns JSONB with:
--   updates: object mapping customer_entitlement_id -> { balance, adjustment, entities }
--   rollover_updates: object mapping rollover_id -> { balance, usage, entities }
--
-- Raises exception if:
--   - next_reset_at in DB differs from input (indicates reset happened after cache was populated)
--   - entity count in DB differs from input (indicates entity was added/removed after cache was populated)
--
DROP FUNCTION IF EXISTS sync_balances_v2(jsonb);

CREATE FUNCTION sync_balances_v2(params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  customer_entitlement_updates jsonb := params->'customer_entitlement_updates';
  rollover_updates_param jsonb := params->'rollover_updates';
  
  ent_obj jsonb;
  ent_id text;
  ent_balance numeric;
  ent_adjustment numeric;
  ent_entities jsonb;
  ent_next_reset_at bigint;
  ent_entity_count int;
  
  db_next_reset_at bigint;
  db_entity_count int;
  
  rollover_obj jsonb;
  rollover_id text;
  rollover_balance numeric;
  rollover_usage numeric;
  rollover_entities jsonb;
  
  updates_json jsonb := '{}'::jsonb;
  rollover_updates_json jsonb := '{}'::jsonb;
  cus_ent_ids text[];
  rollover_ids text[];
BEGIN
  -- ============================================================================
  -- STEP 1: Lock all rows upfront to prevent deadlocks
  -- ============================================================================
  
  -- Extract all customer_entitlement_ids and lock rows
  IF customer_entitlement_updates IS NOT NULL THEN
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(
        jsonb_path_query_array(customer_entitlement_updates, '$[*].customer_entitlement_id')
      )
    ) INTO cus_ent_ids;
    
    IF cus_ent_ids IS NOT NULL AND array_length(cus_ent_ids, 1) > 0 THEN
      -- ORDER BY ensures consistent lock acquisition order to prevent deadlocks
      PERFORM 1 FROM customer_entitlements ce WHERE ce.id = ANY(cus_ent_ids) ORDER BY ce.id FOR UPDATE;
    END IF;
  END IF;
  
  -- Extract all rollover_ids and lock rows
  IF rollover_updates_param IS NOT NULL THEN
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(
        jsonb_path_query_array(rollover_updates_param, '$[*].rollover_id')
      )
    ) INTO rollover_ids;
    
    IF rollover_ids IS NOT NULL AND array_length(rollover_ids, 1) > 0 THEN
      -- ORDER BY ensures consistent lock acquisition order to prevent deadlocks
      PERFORM 1 FROM rollovers r WHERE r.id = ANY(rollover_ids) ORDER BY r.id FOR UPDATE;
    END IF;
  END IF;
  
  -- ============================================================================
  -- STEP 2: Update customer entitlements (with conflict detection)
  -- ============================================================================
  IF customer_entitlement_updates IS NOT NULL THEN
    FOR ent_obj IN SELECT * FROM jsonb_array_elements(customer_entitlement_updates)
    LOOP
      ent_id := ent_obj->>'customer_entitlement_id';
      ent_balance := (ent_obj->>'balance')::numeric;
      ent_adjustment := (ent_obj->>'adjustment')::numeric;
      ent_entities := ent_obj->'entities';
      ent_next_reset_at := (ent_obj->>'next_reset_at')::bigint;
      ent_entity_count := COALESCE((ent_obj->>'entity_count')::int, 0);
      
      -- Get current DB values for conflict detection
      SELECT 
        ce.next_reset_at,
        CASE 
          WHEN ce.entities IS NULL OR jsonb_typeof(ce.entities) != 'object' THEN 0
          ELSE (SELECT count(*) FROM jsonb_object_keys(ce.entities))::int
        END
      INTO db_next_reset_at, db_entity_count
      FROM customer_entitlements ce
      WHERE ce.id = ent_id;
      
      -- Guard 1: Check next_reset_at mismatch (indicates reset happened after cache was populated)
      IF ent_next_reset_at IS NOT NULL AND db_next_reset_at IS NOT NULL 
         AND ent_next_reset_at != db_next_reset_at THEN
        RAISE EXCEPTION 'RESET_AT_MISMATCH cus_ent_id:% cache_reset_at:% db_reset_at:%', 
          ent_id, ent_next_reset_at, db_next_reset_at;
      END IF;
      
      -- Guard 2: Check entity count mismatch (indicates entity was added/removed after cache)
      IF ent_entity_count != COALESCE(db_entity_count, 0) THEN
        RAISE EXCEPTION 'ENTITY_COUNT_MISMATCH cus_ent_id:% cache_count:% db_count:%',
          ent_id, ent_entity_count, COALESCE(db_entity_count, 0);
      END IF;
      
      -- Update the customer_entitlement row directly
      UPDATE customer_entitlements ce
      SET
        balance = COALESCE(ent_balance, ce.balance),
        adjustment = COALESCE(ent_adjustment, ce.adjustment),
        entities = COALESCE(ent_entities, ce.entities)
      WHERE ce.id = ent_id;
      
      -- Track update
      IF FOUND THEN
        updates_json := jsonb_set(
          updates_json,
          ARRAY[ent_id],
          jsonb_build_object(
            'balance', ent_balance,
            'adjustment', ent_adjustment,
            'entities', ent_entities
          )
        );
      END IF;
    END LOOP;
  END IF;
  
  -- ============================================================================
  -- STEP 3: Update rollovers
  -- ============================================================================
  IF rollover_updates_param IS NOT NULL THEN
    FOR rollover_obj IN SELECT * FROM jsonb_array_elements(rollover_updates_param)
    LOOP
      rollover_id := rollover_obj->>'rollover_id';
      rollover_balance := (rollover_obj->>'balance')::numeric;
      rollover_usage := (rollover_obj->>'usage')::numeric;
      rollover_entities := rollover_obj->'entities';
      
      -- Update the rollover row directly
      UPDATE rollovers r
      SET
        balance = COALESCE(rollover_balance, r.balance),
        usage = COALESCE(rollover_usage, r.usage),
        entities = COALESCE(rollover_entities, r.entities)
      WHERE r.id = rollover_id;
      
      -- Track update
      IF FOUND THEN
        rollover_updates_json := jsonb_set(
          rollover_updates_json,
          ARRAY[rollover_id],
          jsonb_build_object(
            'balance', rollover_balance,
            'usage', rollover_usage,
            'entities', rollover_entities
          )
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'updates', updates_json,
    'rollover_updates', rollover_updates_json
  );
END;
$$;
