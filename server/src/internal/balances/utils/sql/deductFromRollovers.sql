-- Rate-card rollovers rate against their owner's current-cycle attribution;
-- deduct_from_cus_ents already holds both row locks.
DROP FUNCTION IF EXISTS deduct_from_rollovers(jsonb);

CREATE FUNCTION deduct_from_rollovers(params jsonb)
RETURNS TABLE(
  total_deducted numeric,
  mutation_logs jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  epsilon numeric := 0.0000000001;
  rollovers_arr jsonb;
  rollover_ids text[];
  amount_to_deduct numeric := (params->>'amount_to_deduct')::numeric;
  target_entity_id text := NULLIF(params->>'target_entity_id', '');
  has_entity_scope boolean := COALESCE(
    (params->>'has_entity_scope')::boolean,
    false
  );

  remaining_amount numeric := amount_to_deduct;
  rollover_obj jsonb;
  rollover_id text;
  customer_entitlement_id text;
  rate_card jsonb;
  credit_cost numeric;
  effective_credit_cost numeric;
  current_balance numeric;
  current_usage numeric;
  current_entities jsonb;
  current_customer_entitlement_id text;
  current_usage_attribution jsonb;
  new_usage_attribution jsonb;
  usage_attribution_delta jsonb;

  entity_key text;
  entity_balance numeric;
  entity_usage numeric;
  credit_deduct_amount numeric;
  feature_deduct_amount numeric;
  new_balance numeric;
  new_usage numeric;
  new_entities jsonb;
  rollover_total_deducted_features numeric := 0;
  mutation_logs_json jsonb := '[]'::jsonb;
BEGIN
  IF params->'rollovers' IS NOT NULL
    AND jsonb_typeof(params->'rollovers') = 'array'
    AND jsonb_array_length(params->'rollovers') > 0
  THEN
    rollovers_arr := params->'rollovers';
  ELSIF params->'rollover_ids' IS NOT NULL
    AND jsonb_typeof(params->'rollover_ids') = 'array'
  THEN
    rollover_ids := ARRAY(
      SELECT jsonb_array_elements_text(params->'rollover_ids')
    );
    SELECT jsonb_agg(jsonb_build_object('id', id, 'credit_cost', 1))
    INTO rollovers_arr
    FROM unnest(rollover_ids) AS id;
  ELSE
    RETURN QUERY SELECT 0::numeric, '[]'::jsonb;
    RETURN;
  END IF;

  IF remaining_amount <= 0 THEN
    RETURN QUERY SELECT 0::numeric, '[]'::jsonb;
    RETURN;
  END IF;

  FOR rollover_obj IN SELECT * FROM jsonb_array_elements(rollovers_arr)
  LOOP
    EXIT WHEN remaining_amount <= 0;

    rollover_id := rollover_obj->>'id';
    rate_card := rollover_obj->'rate_card';
    credit_cost := COALESCE((rollover_obj->>'credit_cost')::numeric, 1);

    SELECT
      r.balance,
      COALESCE(r.usage, 0),
      COALESCE(r.entities, '{}'::jsonb),
      r.cus_ent_id
    INTO
      current_balance,
      current_usage,
      current_entities,
      current_customer_entitlement_id
    FROM rollovers r
    WHERE r.id = rollover_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    customer_entitlement_id := current_customer_entitlement_id;

    IF rate_card IS NOT NULL THEN
      SELECT COALESCE(ce.usage_attribution, '{}'::jsonb)
      INTO current_usage_attribution
      FROM customer_entitlements ce
      WHERE ce.id = customer_entitlement_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'ROLLOVER_ATTRIBUTION_OWNER_MISSING';
      END IF;
    END IF;

    IF has_entity_scope AND target_entity_id IS NOT NULL THEN
      entity_balance := COALESCE(
        (current_entities->target_entity_id->>'balance')::numeric,
        0
      );
      entity_usage := COALESCE(
        (current_entities->target_entity_id->>'usage')::numeric,
        0
      );

      IF rate_card IS NOT NULL THEN
        SELECT *
        INTO
          feature_deduct_amount,
          credit_deduct_amount,
          new_usage_attribution,
          usage_attribution_delta
        FROM credit_rate_rollover_change(
          current_usage_attribution,
          rate_card,
          remaining_amount,
          entity_balance
        );
      ELSE
        credit_deduct_amount := LEAST(
          entity_balance,
          remaining_amount * credit_cost
        );
        feature_deduct_amount := CASE
          WHEN credit_deduct_amount > 0 THEN credit_deduct_amount / credit_cost
          ELSE 0
        END;
        new_usage_attribution := NULL;
        usage_attribution_delta := NULL;
      END IF;

      IF ABS(feature_deduct_amount) > epsilon THEN
        new_balance := entity_balance - credit_deduct_amount;
        new_usage := entity_usage + credit_deduct_amount;
        new_entities := jsonb_set(
          jsonb_set(
            current_entities,
            ARRAY[target_entity_id, 'balance'],
            to_jsonb(new_balance),
            true
          ),
          ARRAY[target_entity_id, 'usage'],
          to_jsonb(new_usage),
          true
        );
        UPDATE rollovers SET entities = new_entities WHERE id = rollover_id;
        current_entities := new_entities;

        IF rate_card IS NOT NULL THEN
          UPDATE customer_entitlements
          SET usage_attribution = new_usage_attribution
          WHERE id = customer_entitlement_id;
          current_usage_attribution := new_usage_attribution;
        END IF;

        effective_credit_cost := CASE
          WHEN ABS(feature_deduct_amount) <= epsilon THEN 0
          ELSE credit_deduct_amount / feature_deduct_amount
        END;
        mutation_logs_json := mutation_logs_json || jsonb_build_array(
          jsonb_build_object(
            'target_type', 'rollover',
            'customer_entitlement_id', customer_entitlement_id,
            'rollover_id', rollover_id,
            'entity_id', target_entity_id,
            'credit_cost', effective_credit_cost,
            'balance_delta', -credit_deduct_amount,
            'adjustment_delta', 0,
            'usage_delta', credit_deduct_amount,
            'value_delta', feature_deduct_amount
          ) || CASE
            WHEN usage_attribution_delta IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object(
              'usage_attribution_delta', usage_attribution_delta
            )
          END
        );
        remaining_amount := remaining_amount - feature_deduct_amount;
        rollover_total_deducted_features :=
          rollover_total_deducted_features + feature_deduct_amount;
      END IF;

    ELSIF has_entity_scope THEN
      new_entities := current_entities;

      FOR entity_key IN SELECT jsonb_object_keys(current_entities) ORDER BY 1
      LOOP
        EXIT WHEN remaining_amount <= 0;

        entity_balance := COALESCE(
          (new_entities->entity_key->>'balance')::numeric,
          0
        );
        entity_usage := COALESCE(
          (new_entities->entity_key->>'usage')::numeric,
          0
        );

        IF rate_card IS NOT NULL THEN
          SELECT *
          INTO
            feature_deduct_amount,
            credit_deduct_amount,
            new_usage_attribution,
            usage_attribution_delta
          FROM credit_rate_rollover_change(
            current_usage_attribution,
            rate_card,
            remaining_amount,
            entity_balance
          );
        ELSE
          credit_deduct_amount := LEAST(
            entity_balance,
            remaining_amount * credit_cost
          );
          feature_deduct_amount := CASE
            WHEN credit_deduct_amount > 0 THEN credit_deduct_amount / credit_cost
            ELSE 0
          END;
          new_usage_attribution := NULL;
          usage_attribution_delta := NULL;
        END IF;

        IF ABS(feature_deduct_amount) > epsilon THEN
          new_balance := entity_balance - credit_deduct_amount;
          new_usage := entity_usage + credit_deduct_amount;
          new_entities := jsonb_set(
            jsonb_set(
              new_entities,
              ARRAY[entity_key, 'balance'],
              to_jsonb(new_balance),
              true
            ),
            ARRAY[entity_key, 'usage'],
            to_jsonb(new_usage),
            true
          );

          IF rate_card IS NOT NULL THEN
            UPDATE customer_entitlements
            SET usage_attribution = new_usage_attribution
            WHERE id = customer_entitlement_id;
            current_usage_attribution := new_usage_attribution;
          END IF;

          effective_credit_cost := CASE
            WHEN ABS(feature_deduct_amount) <= epsilon THEN 0
            ELSE credit_deduct_amount / feature_deduct_amount
          END;
          mutation_logs_json := mutation_logs_json || jsonb_build_array(
            jsonb_build_object(
              'target_type', 'rollover',
              'customer_entitlement_id', customer_entitlement_id,
              'rollover_id', rollover_id,
              'entity_id', entity_key,
              'credit_cost', effective_credit_cost,
              'balance_delta', -credit_deduct_amount,
              'adjustment_delta', 0,
              'usage_delta', credit_deduct_amount,
              'value_delta', feature_deduct_amount
            ) || CASE
              WHEN usage_attribution_delta IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object(
                'usage_attribution_delta', usage_attribution_delta
              )
            END
          );
          remaining_amount := remaining_amount - feature_deduct_amount;
          rollover_total_deducted_features :=
            rollover_total_deducted_features + feature_deduct_amount;
        END IF;
      END LOOP;

      IF new_entities IS DISTINCT FROM current_entities THEN
        UPDATE rollovers SET entities = new_entities WHERE id = rollover_id;
      END IF;

    ELSE
      IF rate_card IS NOT NULL THEN
        SELECT *
        INTO
          feature_deduct_amount,
          credit_deduct_amount,
          new_usage_attribution,
          usage_attribution_delta
        FROM credit_rate_rollover_change(
          current_usage_attribution,
          rate_card,
          remaining_amount,
          current_balance
        );
      ELSE
        credit_deduct_amount := LEAST(
          current_balance,
          remaining_amount * credit_cost
        );
        feature_deduct_amount := CASE
          WHEN credit_deduct_amount > 0 THEN credit_deduct_amount / credit_cost
          ELSE 0
        END;
        new_usage_attribution := NULL;
        usage_attribution_delta := NULL;
      END IF;

      IF ABS(feature_deduct_amount) > epsilon THEN
        UPDATE rollovers
        SET
          balance = balance - credit_deduct_amount,
          usage = COALESCE(usage, 0) + credit_deduct_amount
        WHERE id = rollover_id;

        IF rate_card IS NOT NULL THEN
          UPDATE customer_entitlements
          SET usage_attribution = new_usage_attribution
          WHERE id = customer_entitlement_id;
          current_usage_attribution := new_usage_attribution;
        END IF;

        effective_credit_cost := CASE
          WHEN ABS(feature_deduct_amount) <= epsilon THEN 0
          ELSE credit_deduct_amount / feature_deduct_amount
        END;
        mutation_logs_json := mutation_logs_json || jsonb_build_array(
          jsonb_build_object(
            'target_type', 'rollover',
            'customer_entitlement_id', customer_entitlement_id,
            'rollover_id', rollover_id,
            'entity_id', NULL,
            'credit_cost', effective_credit_cost,
            'balance_delta', -credit_deduct_amount,
            'adjustment_delta', 0,
            'usage_delta', credit_deduct_amount,
            'value_delta', feature_deduct_amount
          ) || CASE
            WHEN usage_attribution_delta IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object(
              'usage_attribution_delta', usage_attribution_delta
            )
          END
        );
        remaining_amount := remaining_amount - feature_deduct_amount;
        rollover_total_deducted_features :=
          rollover_total_deducted_features + feature_deduct_amount;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    rollover_total_deducted_features,
    mutation_logs_json;
END;
$$;
