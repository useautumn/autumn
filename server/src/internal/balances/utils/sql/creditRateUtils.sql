DROP FUNCTION IF EXISTS credit_rate_cost_at_usage(jsonb, numeric);

CREATE FUNCTION credit_rate_cost_at_usage(rate_card jsonb, usage numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  bounded_usage numeric := GREATEST(0, COALESCE(usage, 0));
  feature_amount numeric := COALESCE((rate_card->>'feature_amount')::numeric, 0);
  previous_boundary numeric := 0;
  boundary numeric;
  tier_units numeric;
  total_cost numeric := 0;
  tier jsonb;
BEGIN
  IF feature_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_RATE_CARD_FEATURE_AMOUNT';
  END IF;

  IF COALESCE(rate_card->>'tier_behavior', '') != 'graduated' THEN
    RETURN bounded_usage
      * COALESCE((rate_card->>'credit_amount')::numeric, 0)
      / feature_amount;
  END IF;

  FOR tier IN SELECT * FROM jsonb_array_elements(rate_card->'tiers')
  LOOP
    boundary := CASE
      WHEN tier->>'to' = 'inf' THEN bounded_usage
      ELSE (tier->>'to')::numeric
    END;
    tier_units := GREATEST(
      0,
      LEAST(bounded_usage, boundary) - previous_boundary
    );
    total_cost := total_cost
      + tier_units * COALESCE((tier->>'credit_amount')::numeric, 0)
        / feature_amount;

    IF bounded_usage <= boundary OR tier->>'to' = 'inf' THEN
      RETURN total_cost;
    END IF;
    previous_boundary := boundary;
  END LOOP;

  RAISE EXCEPTION 'INVALID_CREDIT_RATE_CARD_FINAL_TIER';
END;
$$;

DROP FUNCTION IF EXISTS credit_rate_units_for_credit_change(jsonb, numeric, numeric, numeric);

CREATE FUNCTION credit_rate_units_for_credit_change(
  rate_card jsonb,
  current_units numeric,
  requested_units numeric,
  allowed_credit_change numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  epsilon numeric := 0.0000000001;
  position numeric := GREATEST(0, COALESCE(current_units, 0));
  remaining_units numeric := ABS(COALESCE(requested_units, 0));
  remaining_credits numeric := ABS(COALESCE(allowed_credit_change, 0));
  direction integer := CASE WHEN requested_units < 0 THEN -1 ELSE 1 END;
  feature_amount numeric := COALESCE((rate_card->>'feature_amount')::numeric, 0);
  tiers jsonb;
  tier jsonb;
  tier_index integer;
  previous_boundary numeric := 0;
  lower_boundary numeric;
  upper_boundary numeric;
  segment_start numeric;
  segment_units numeric;
  unit_cost numeric;
  units_to_apply numeric;
  applied_units numeric := 0;
BEGIN
  IF remaining_units <= epsilon THEN
    RETURN 0;
  END IF;
  IF direction < 0 THEN
    remaining_units := LEAST(remaining_units, position);
  END IF;
  IF feature_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_RATE_CARD_FEATURE_AMOUNT';
  END IF;

  tiers := CASE
    WHEN rate_card->>'tier_behavior' = 'graduated' THEN rate_card->'tiers'
    ELSE jsonb_build_array(jsonb_build_object(
      'to', 'inf',
      'credit_amount', COALESCE((rate_card->>'credit_amount')::numeric, 0)
    ))
  END;

  IF direction > 0 THEN
    FOR tier IN SELECT * FROM jsonb_array_elements(tiers)
    LOOP
      EXIT WHEN remaining_units <= epsilon;
      upper_boundary := CASE
        WHEN tier->>'to' = 'inf' THEN position + remaining_units
        ELSE (tier->>'to')::numeric
      END;

      IF position < upper_boundary THEN
        segment_start := GREATEST(position, previous_boundary);
        segment_units := LEAST(
          remaining_units,
          GREATEST(0, upper_boundary - segment_start)
        );
        unit_cost := COALESCE((tier->>'credit_amount')::numeric, 0)
          / feature_amount;
        units_to_apply := segment_units;

        IF unit_cost > epsilon THEN
          units_to_apply := LEAST(segment_units, remaining_credits / unit_cost);
          remaining_credits := GREATEST(
            0,
            remaining_credits - units_to_apply * unit_cost
          );
        END IF;

        position := position + units_to_apply;
        applied_units := applied_units + units_to_apply;
        remaining_units := remaining_units - units_to_apply;
        EXIT WHEN units_to_apply + epsilon < segment_units;
      END IF;

      IF tier->>'to' != 'inf' THEN
        previous_boundary := upper_boundary;
      END IF;
    END LOOP;
  ELSE
    FOR tier_index IN REVERSE (jsonb_array_length(tiers) - 1)..0
    LOOP
      EXIT WHEN remaining_units <= epsilon;
      tier := tiers->tier_index;
      lower_boundary := CASE
        WHEN tier_index = 0 THEN 0
        ELSE (tiers->(tier_index - 1)->>'to')::numeric
      END;
      upper_boundary := CASE
        WHEN tier->>'to' = 'inf' THEN position
        ELSE (tier->>'to')::numeric
      END;

      IF position > lower_boundary AND position <= upper_boundary THEN
        segment_units := LEAST(remaining_units, position - lower_boundary);
        unit_cost := COALESCE((tier->>'credit_amount')::numeric, 0)
          / feature_amount;
        units_to_apply := segment_units;

        IF unit_cost > epsilon THEN
          units_to_apply := LEAST(segment_units, remaining_credits / unit_cost);
          remaining_credits := GREATEST(
            0,
            remaining_credits - units_to_apply * unit_cost
          );
        END IF;

        position := position - units_to_apply;
        applied_units := applied_units + units_to_apply;
        remaining_units := remaining_units - units_to_apply;
        EXIT WHEN units_to_apply + epsilon < segment_units;
      END IF;
    END LOOP;
  END IF;

  RETURN direction * applied_units;
END;
$$;

DROP FUNCTION IF EXISTS credit_rate_current_units(jsonb, jsonb);

CREATE FUNCTION credit_rate_current_units(
  usage_attribution jsonb,
  rate_card jsonb
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (
      COALESCE(usage_attribution, '{}'::jsonb)
        ->(rate_card->>'source_internal_feature_id')
        ->>'units'
    )::numeric,
    0
  );
$$;

DROP FUNCTION IF EXISTS apply_credit_rate_attribution(jsonb, jsonb, numeric, numeric);

CREATE FUNCTION apply_credit_rate_attribution(
  usage_attribution jsonb,
  rate_card jsonb,
  units_delta numeric,
  credits_delta numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb := COALESCE(usage_attribution, '{}'::jsonb);
  source_feature_id text := rate_card->>'source_internal_feature_id';
  current_item jsonb := COALESCE(result->source_feature_id, '{}'::jsonb);
  next_units numeric := COALESCE((current_item->>'units')::numeric, 0)
    + COALESCE(units_delta, 0);
  next_credits numeric := COALESCE((current_item->>'credits')::numeric, 0)
    + COALESCE(credits_delta, 0);
BEGIN
  IF ABS(next_units) <= 0.0000000001
     AND ABS(next_credits) <= 0.0000000001 THEN
    RETURN result - source_feature_id;
  END IF;

  RETURN jsonb_set(
    result,
    ARRAY[source_feature_id],
    jsonb_build_object('units', next_units, 'credits', next_credits),
    true
  );
END;
$$;

DROP FUNCTION IF EXISTS reprice_credit_rate_mutation_logs(jsonb, text, numeric, numeric);

CREATE FUNCTION reprice_credit_rate_mutation_logs(
  mutation_logs jsonb,
  customer_entitlement_id text,
  deducted_credits numeric,
  deducted_units numeric
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN log_item->>'customer_entitlement_id' = customer_entitlement_id
          AND deducted_credits != 0
        THEN jsonb_set(
          jsonb_set(
            log_item,
            '{value_delta}',
            to_jsonb(
              deducted_units
                * (-(log_item->>'balance_delta')::numeric)
                / deducted_credits
            )
          ),
          '{credit_cost}',
          to_jsonb(
            CASE
              WHEN deducted_units = 0 THEN 0
              ELSE deducted_credits / deducted_units
            END
          )
        )
        ELSE log_item
      END
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(mutation_logs, '[]'::jsonb)) log_item;
$$;

DROP FUNCTION IF EXISTS deduct_from_credit_rate_main_balance(jsonb);

CREATE FUNCTION deduct_from_credit_rate_main_balance(params jsonb)
RETURNS TABLE (
  deducted numeric,
  deducted_units numeric,
  new_balance numeric,
  new_entities jsonb,
  new_adjustment numeric,
  new_usage_attribution jsonb,
  mutation_logs jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  epsilon numeric := 0.0000000001;
  customer_entitlement_id text := NULLIF(
    params->>'customer_entitlement_id',
    ''
  );
  rate_card jsonb := params->'rate_card';
  current_usage_attribution jsonb := COALESCE(
    params->'current_usage_attribution',
    '{}'::jsonb
  );
  requested_units numeric := COALESCE(
    (params->>'amount_to_deduct')::numeric,
    0
  );
  current_units numeric;
  requested_credit_change numeric;
  effective_credit_cost numeric;
BEGIN
  IF rate_card IS NULL OR jsonb_typeof(rate_card) != 'object' THEN
    RAISE EXCEPTION 'MISSING_CREDIT_RATE_CARD';
  END IF;

  current_units := credit_rate_current_units(
    current_usage_attribution,
    rate_card
  );
  requested_credit_change := credit_rate_cost_at_usage(
    rate_card,
    GREATEST(0, current_units + requested_units)
  ) - credit_rate_cost_at_usage(rate_card, current_units);

  deducted := 0;
  deducted_units := 0;
  new_balance := (params->>'current_balance')::numeric;
  new_entities := COALESCE(params->'current_entities', '{}'::jsonb);
  new_adjustment := COALESCE(
    (params->>'current_adjustment')::numeric,
    0
  );
  new_usage_attribution := current_usage_attribution;
  mutation_logs := '[]'::jsonb;

  IF ABS(requested_units) <= epsilon THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF ABS(requested_credit_change) > epsilon THEN
    effective_credit_cost := requested_credit_change / requested_units;

    SELECT
      deduction_result.deducted,
      deduction_result.new_balance,
      deduction_result.new_entities,
      deduction_result.new_adjustment,
      deduction_result.mutation_logs
    INTO
      deducted,
      new_balance,
      new_entities,
      new_adjustment,
      mutation_logs
    FROM deduct_from_main_balance(
      params || jsonb_build_object('credit_cost', effective_credit_cost)
    ) deduction_result;
  END IF;

  deducted_units := credit_rate_units_for_credit_change(
    rate_card,
    current_units,
    requested_units,
    deducted
  );

  IF ABS(deducted_units) > epsilon THEN
    new_usage_attribution := apply_credit_rate_attribution(
      current_usage_attribution,
      rate_card,
      deducted_units,
      deducted
    );

    IF ABS(deducted) <= epsilon THEN
      mutation_logs := jsonb_build_array(jsonb_build_object(
        'target_type', 'customer_entitlement',
        'customer_entitlement_id', customer_entitlement_id,
        'rollover_id', NULL,
        'entity_id', NULLIF(params->>'target_entity_id', ''),
        'credit_cost', 0,
        'balance_delta', 0,
        'adjustment_delta', 0,
        'usage_delta', 0,
        'value_delta', deducted_units
      ));
    ELSE
      mutation_logs := reprice_credit_rate_mutation_logs(
        mutation_logs,
        customer_entitlement_id,
        deducted,
        deducted_units
      );
    END IF;
  END IF;

  RETURN NEXT;
END;
$$;
