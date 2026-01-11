-- Sync balances from Redis cache to Postgres (V2 - simplified)
--
-- Params (JSONB):
--   customer_entitlement_updates: array of objects with:
--     - customer_entitlement_id: string
--     - balance: number
--     - adjustment: number
--     - entities: jsonb (the full entities object)
--
-- Returns JSONB with:
--   updates: object mapping customer_entitlement_id -> { balance, adjustment, entities }
--
DROP FUNCTION IF EXISTS sync_balances_v2(jsonb);

CREATE FUNCTION sync_balances_v2(params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  customer_entitlement_updates jsonb := params->'customer_entitlement_updates';
  
  ent_obj jsonb;
  ent_id text;
  ent_balance numeric;
  ent_adjustment numeric;
  ent_entities jsonb;
  
  updates_json jsonb := '{}'::jsonb;
  cus_ent_ids text[];
BEGIN
  -- Extract all customer_entitlement_ids and lock rows upfront
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(
      jsonb_path_query_array(customer_entitlement_updates, '$[*].customer_entitlement_id')
    )
  ) INTO cus_ent_ids;
  
  IF cus_ent_ids IS NOT NULL AND array_length(cus_ent_ids, 1) > 0 THEN
    PERFORM 1 FROM customer_entitlements ce WHERE ce.id = ANY(cus_ent_ids) FOR UPDATE;
  END IF;
  
  -- Iterate and update each entitlement
  FOR ent_obj IN SELECT * FROM jsonb_array_elements(customer_entitlement_updates)
  LOOP
    ent_id := ent_obj->>'customer_entitlement_id';
    ent_balance := (ent_obj->>'balance')::numeric;
    ent_adjustment := (ent_obj->>'adjustment')::numeric;
    ent_entities := ent_obj->'entities';
    
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
  
  RETURN jsonb_build_object('updates', updates_json);
END;
$$;
