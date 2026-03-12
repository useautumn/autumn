DROP FUNCTION IF EXISTS get_available_overage_from_spend_limit(jsonb);

CREATE FUNCTION get_available_overage_from_spend_limit(params jsonb)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  spend_limit jsonb := params->'spend_limit';
  usage_based_cus_ent_ids text[] := CASE
    WHEN params->'usage_based_cus_ent_ids' IS NULL
      OR jsonb_typeof(params->'usage_based_cus_ent_ids') != 'array'
    THEN NULL
    ELSE ARRAY(SELECT jsonb_array_elements_text(params->'usage_based_cus_ent_ids'))
  END;
  target_entity_id text := NULLIF(params->>'target_entity_id', '');

  total_overage numeric := 0;
  spend_limit_overage numeric;
  cus_ent_id text;
  current_balance numeric;
  current_entities jsonb;
  entity_balance numeric;
  entity_key text;
BEGIN
  IF spend_limit IS NULL OR spend_limit->>'overage_limit' IS NULL THEN
    RETURN NULL;
  END IF;

  IF usage_based_cus_ent_ids IS NULL OR array_length(usage_based_cus_ent_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  spend_limit_overage := (spend_limit->>'overage_limit')::numeric;

  FOREACH cus_ent_id IN ARRAY usage_based_cus_ent_ids
  LOOP
    SELECT
      ce.balance,
      COALESCE(ce.entities, '{}'::jsonb)
    INTO
      current_balance,
      current_entities
    FROM customer_entitlements ce
    WHERE ce.id = cus_ent_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF current_entities IS NOT NULL AND current_entities != '{}'::jsonb THEN
      IF target_entity_id IS NOT NULL THEN
        entity_balance := COALESCE(
          (current_entities->target_entity_id->>'balance')::numeric,
          0
        );
        total_overage := total_overage + GREATEST(-entity_balance, 0);
      ELSE
        FOR entity_key IN SELECT jsonb_object_keys(current_entities) ORDER BY 1
        LOOP
          entity_balance := COALESCE(
            (current_entities->entity_key->>'balance')::numeric,
            0
          );
          total_overage := total_overage + GREATEST(-entity_balance, 0);
        END LOOP;
      END IF;
    ELSE
      total_overage := total_overage + GREATEST(-COALESCE(current_balance, 0), 0);
    END IF;
  END LOOP;

  RETURN GREATEST(0, spend_limit_overage - total_overage);
END;
$$;
