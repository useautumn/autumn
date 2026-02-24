-- Atomically reset customer entitlements that have passed their next_reset_at.
-- Uses per-row locking + optimistic check: only resets a cusEnt if its
-- next_reset_at does NOT already equal the new value (prevents double-resets).
--
-- Params (JSONB):
--   resets: array of objects with:
--     - cus_ent_id: text
--     - balance: numeric (null if entity-scoped)
--     - additional_balance: numeric (null if entity-scoped)
--     - adjustment: numeric
--     - entities: jsonb (null if non-entity)
--     - next_reset_at: bigint (new next_reset_at value)
--     - rollover_insert: jsonb object or null, with fields:
--         id, cus_ent_id, balance, usage, expires_at, entities
--
-- Returns JSONB:
--   {
--     "applied": {
--       "<cus_ent_id>": {
--         "balance": number,
--         "additional_balance": number,
--         "adjustment": number,
--         "entities": jsonb,
--         "next_reset_at": number,
--         "rollover": jsonb or null
--       }
--     },
--     "skipped": ["id1", "id2"]
--   }
--
DROP FUNCTION IF EXISTS reset_customer_entitlements(jsonb);

CREATE FUNCTION reset_customer_entitlements(params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  resets_param jsonb := params->'resets';

  reset_obj jsonb;
  ent_id text;
  new_balance numeric;
  new_additional_balance numeric;
  new_adjustment numeric;
  new_entities jsonb;
  new_next_reset_at bigint;
  rollover_obj jsonb;

  db_next_reset_at bigint;
  updated_row record;

  applied_json jsonb := '{}'::jsonb;
  skipped_ids jsonb := '[]'::jsonb;
BEGIN
  IF resets_param IS NULL OR jsonb_array_length(resets_param) = 0 THEN
    RETURN jsonb_build_object('applied', '{}'::jsonb, 'skipped', '[]'::jsonb);
  END IF;

  FOR reset_obj IN SELECT * FROM jsonb_array_elements(resets_param)
  LOOP
    ent_id := reset_obj->>'cus_ent_id';
    new_balance := (reset_obj->>'balance')::numeric;
    new_additional_balance := (reset_obj->>'additional_balance')::numeric;
    new_adjustment := (reset_obj->>'adjustment')::numeric;
    new_entities := reset_obj->'entities';
    new_next_reset_at := (reset_obj->>'next_reset_at')::bigint;
    rollover_obj := reset_obj->'rollover_insert';

    -- Lock and read the single row
    SELECT ce.next_reset_at INTO db_next_reset_at
    FROM customer_entitlements ce
    WHERE ce.id = ent_id
    FOR UPDATE;

    -- Skip if the row doesn't exist (stale ID from a deleted cusEnt)
    IF NOT FOUND THEN
      skipped_ids := skipped_ids || to_jsonb(ent_id);
      CONTINUE;
    END IF;

    -- Optimistic lock: skip if next_reset_at already equals the new value
    IF db_next_reset_at IS NOT DISTINCT FROM new_next_reset_at THEN
      skipped_ids := skipped_ids || to_jsonb(ent_id);
      CONTINUE;
    END IF;

    -- Apply the reset update and capture the updated row
    UPDATE customer_entitlements ce
    SET
      balance = COALESCE(new_balance, ce.balance),
      additional_balance = COALESCE(new_additional_balance, ce.additional_balance),
      adjustment = COALESCE(new_adjustment, ce.adjustment),
      entities = COALESCE(new_entities, ce.entities),
      next_reset_at = new_next_reset_at
    WHERE ce.id = ent_id
    RETURNING ce.balance, ce.additional_balance, ce.adjustment, ce.entities,
              ce.next_reset_at, ce.cache_version
    INTO updated_row;

    -- Insert rollover row if provided
    IF rollover_obj IS NOT NULL AND rollover_obj != 'null'::jsonb THEN
      INSERT INTO rollovers (id, cus_ent_id, balance, usage, expires_at, entities)
      VALUES (
        rollover_obj->>'id',
        rollover_obj->>'cus_ent_id',
        (rollover_obj->>'balance')::numeric,
        (rollover_obj->>'usage')::numeric,
        (rollover_obj->>'expires_at')::numeric,
        COALESCE(rollover_obj->'entities', '{}'::jsonb)
      );
    END IF;

    -- Record the latest state of the updated cusEnt
    applied_json := jsonb_set(
      applied_json,
      ARRAY[ent_id],
      jsonb_build_object(
        'balance', updated_row.balance,
        'additional_balance', updated_row.additional_balance,
        'adjustment', updated_row.adjustment,
        'entities', updated_row.entities,
        'next_reset_at', updated_row.next_reset_at,
        'rollover', CASE
          WHEN rollover_obj IS NOT NULL AND rollover_obj != 'null'::jsonb THEN rollover_obj
          ELSE NULL
        END
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'applied', applied_json,
    'skipped', skipped_ids
  );
END;
$$;
