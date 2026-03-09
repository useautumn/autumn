DROP FUNCTION IF EXISTS unwind_from_lock_receipt(jsonb);

CREATE FUNCTION unwind_from_lock_receipt(params jsonb)
RETURNS TABLE (
  remaining_unwind_value numeric,
  updates jsonb,
  modified_rollover_ids text[],
  mutation_logs jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  lock_receipt jsonb := params->'lock_receipt';
  receipt_items jsonb := COALESCE(lock_receipt->'items', '[]'::jsonb);
  requested_unwind_value numeric := COALESCE((params->>'unwind_value')::numeric, 0);

  item_index integer;
  item jsonb;
  item_target_type text;
  customer_entitlement_id text;
  rollover_id text;
  entity_id text;
  credit_cost numeric;

  item_value_delta numeric;
  item_value_magnitude numeric;
  unwind_iteration_value numeric;
  credits_to_unwind numeric;

  inverse_balance_delta numeric;
  inverse_adjustment_delta numeric;
  inverse_usage_delta numeric;
  inverse_value_delta numeric;

  updated_balance numeric;
  updated_additional_balance numeric;
  updated_adjustment numeric;
  updated_entities jsonb;

  remaining_value numeric := requested_unwind_value;
  updates_json jsonb := '{}'::jsonb;
  mutation_logs_json jsonb := '[]'::jsonb;
  modified_rollover_ids_array text[] := ARRAY[]::text[];
BEGIN
  IF requested_unwind_value <= 0 THEN
    RETURN QUERY SELECT 0::numeric, '{}'::jsonb, ARRAY[]::text[], '[]'::jsonb;
    RETURN;
  END IF;

  IF jsonb_typeof(receipt_items) != 'array' OR jsonb_array_length(receipt_items) = 0 THEN
    RAISE EXCEPTION 'LOCK_RECEIPT_ITEMS_MISSING';
  END IF;

  FOR item_index IN REVERSE jsonb_array_length(receipt_items) - 1..0
  LOOP
    EXIT WHEN remaining_value <= 0;

    item := receipt_items->item_index;
    item_target_type := item->>'target_type';
    customer_entitlement_id := NULLIF(item->>'customer_entitlement_id', '');
    rollover_id := NULLIF(item->>'rollover_id', '');
    entity_id := NULLIF(item->>'entity_id', '');
    credit_cost := COALESCE((item->>'credit_cost')::numeric, 1);

    item_value_delta := COALESCE((item->>'value_delta')::numeric, 0);
    item_value_magnitude := ABS(item_value_delta);
    unwind_iteration_value := LEAST(item_value_magnitude, remaining_value);

    IF unwind_iteration_value <= 0 THEN
      CONTINUE;
    END IF;

    credits_to_unwind := unwind_iteration_value * credit_cost;

    inverse_balance_delta := CASE
      WHEN COALESCE((item->>'balance_delta')::numeric, 0) > 0 THEN -credits_to_unwind
      WHEN COALESCE((item->>'balance_delta')::numeric, 0) < 0 THEN credits_to_unwind
      ELSE 0
    END;
    inverse_adjustment_delta := CASE
      WHEN COALESCE((item->>'adjustment_delta')::numeric, 0) > 0 THEN -credits_to_unwind
      WHEN COALESCE((item->>'adjustment_delta')::numeric, 0) < 0 THEN credits_to_unwind
      ELSE 0
    END;
    inverse_usage_delta := CASE
      WHEN COALESCE((item->>'usage_delta')::numeric, 0) > 0 THEN -credits_to_unwind
      WHEN COALESCE((item->>'usage_delta')::numeric, 0) < 0 THEN credits_to_unwind
      ELSE 0
    END;
    inverse_value_delta := CASE
      WHEN item_value_delta > 0 THEN -unwind_iteration_value
      WHEN item_value_delta < 0 THEN unwind_iteration_value
      ELSE 0
    END;

    IF item_target_type = 'customer_entitlement' THEN
      IF customer_entitlement_id IS NULL THEN
        RAISE EXCEPTION 'LOCK_CUSTOMER_ENTITLEMENT_ID_MISSING';
      END IF;

      IF entity_id IS NULL THEN
        UPDATE customer_entitlements ce
        SET
          balance = ce.balance + inverse_balance_delta,
          adjustment = COALESCE(ce.adjustment, 0) + inverse_adjustment_delta
        WHERE ce.id = customer_entitlement_id
        RETURNING
          ce.balance,
          COALESCE(ce.additional_balance, 0),
          COALESCE(ce.adjustment, 0),
          COALESCE(ce.entities, '{}'::jsonb)
        INTO updated_balance, updated_additional_balance, updated_adjustment, updated_entities;
      ELSE
        UPDATE customer_entitlements ce
        SET entities = jsonb_set(
          jsonb_set(
            COALESCE(ce.entities, '{}'::jsonb),
            ARRAY[entity_id, 'balance'],
            to_jsonb(COALESCE((COALESCE(ce.entities, '{}'::jsonb)->entity_id->>'balance')::numeric, 0) + inverse_balance_delta),
            true
          ),
          ARRAY[entity_id, 'adjustment'],
          to_jsonb(COALESCE((COALESCE(ce.entities, '{}'::jsonb)->entity_id->>'adjustment')::numeric, 0) + inverse_adjustment_delta),
          true
        )
        WHERE ce.id = customer_entitlement_id
        RETURNING
          ce.balance,
          COALESCE(ce.additional_balance, 0),
          COALESCE(ce.adjustment, 0),
          COALESCE(ce.entities, '{}'::jsonb)
        INTO updated_balance, updated_additional_balance, updated_adjustment, updated_entities;
      END IF;

      updates_json := jsonb_set(
        updates_json,
        ARRAY[customer_entitlement_id],
        jsonb_build_object(
          'balance', updated_balance,
          'additional_balance', updated_additional_balance,
          'adjustment', updated_adjustment,
          'entities', updated_entities,
          'deducted', COALESCE((updates_json->customer_entitlement_id->>'deducted')::numeric, 0) + inverse_value_delta,
          'additional_deducted', COALESCE((updates_json->customer_entitlement_id->>'additional_deducted')::numeric, 0)
        ),
        true
      );
    ELSIF item_target_type = 'rollover' THEN
      IF rollover_id IS NULL THEN
        RAISE EXCEPTION 'LOCK_ROLLOVER_ID_MISSING';
      END IF;

      IF entity_id IS NULL THEN
        UPDATE rollovers r
        SET
          balance = r.balance + inverse_balance_delta,
          usage = COALESCE(r.usage, 0) + inverse_usage_delta
        WHERE r.id = rollover_id;
      ELSE
        UPDATE rollovers r
        SET entities = jsonb_set(
          jsonb_set(
            COALESCE(r.entities, '{}'::jsonb),
            ARRAY[entity_id, 'balance'],
            to_jsonb(COALESCE((COALESCE(r.entities, '{}'::jsonb)->entity_id->>'balance')::numeric, 0) + inverse_balance_delta),
            true
          ),
          ARRAY[entity_id, 'usage'],
          to_jsonb(COALESCE((COALESCE(r.entities, '{}'::jsonb)->entity_id->>'usage')::numeric, 0) + inverse_usage_delta),
          true
        )
        WHERE r.id = rollover_id;
      END IF;

      modified_rollover_ids_array := array_append(modified_rollover_ids_array, rollover_id);
    ELSE
      RAISE EXCEPTION 'INVALID_LOCK_ITEM_TARGET_TYPE|targetType:%', item_target_type;
    END IF;

    mutation_logs_json := mutation_logs_json || jsonb_build_array(
      jsonb_build_object(
        'target_type', item_target_type,
        'customer_entitlement_id', customer_entitlement_id,
        'rollover_id', rollover_id,
        'entity_id', entity_id,
        'credit_cost', credit_cost,
        'balance_delta', inverse_balance_delta,
        'adjustment_delta', inverse_adjustment_delta,
        'usage_delta', inverse_usage_delta,
        'value_delta', inverse_value_delta
      )
    );

    remaining_value := remaining_value - unwind_iteration_value;
  END LOOP;

  IF remaining_value > 0 THEN
    RAISE EXCEPTION 'LOCK_UNWIND_INCOMPLETE|remaining:%', remaining_value;
  END IF;

  RETURN QUERY
  SELECT
    remaining_value,
    updates_json,
    modified_rollover_ids_array,
    mutation_logs_json;
END;
$$;
