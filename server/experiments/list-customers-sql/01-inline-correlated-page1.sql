-- ============================================================
-- Variant 01: inline correlated subqueries (no cpwp CTE)
-- Page 1, limit=1000, withSubs=true
-- Target org: Firecrawl
--
-- Hypothesis: eliminating the materialize-then-group-then-sort
-- of customer_products_with_prices saves the 180ms sort that
-- dominated the baseline. Per-row LATERAL keeps json_agg local.
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT)
WITH customer_records AS (
  SELECT c.*
  FROM customers c
  WHERE c.org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'
    AND c.env = 'live'
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT 1001
)

SELECT
  cr.*,

  COALESCE((
    SELECT json_agg(row_to_json(cp_full) ORDER BY cp_full.created_at DESC)
    FROM (
      SELECT
        cp.*,
        row_to_json(prod) AS product,
        COALESCE((
          SELECT json_agg(
            to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))
          ) FILTER (WHERE cpr.id IS NOT NULL)
          FROM customer_prices cpr
          LEFT JOIN prices p ON cpr.price_id = p.id
          WHERE cpr.customer_product_id = cp.id
        ), '[]'::json) AS customer_prices,
        COALESCE((
          SELECT json_agg(
            to_jsonb(ce.*) || jsonb_build_object(
              'entitlement', (
                SELECT row_to_json(ent_with_feature)
                FROM (
                  SELECT e.*, row_to_json(f) AS feature
                  FROM entitlements e
                  JOIN features f ON e.internal_feature_id = f.internal_id
                  WHERE e.id = ce.entitlement_id
                ) AS ent_with_feature
              ),
              'replaceables', COALESCE((
                SELECT json_agg(row_to_json(r)) FILTER (WHERE r.id IS NOT NULL)
                FROM replaceables r
                WHERE r.cus_ent_id = ce.id
              ), '[]'::json),
              'rollovers', COALESCE((
                SELECT json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST)
                FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL)
                FROM rollovers ro
                WHERE ro.cus_ent_id = ce.id
              ), '[]'::json)
            )
          ) FILTER (WHERE ce.id IS NOT NULL)
          FROM customer_entitlements ce
          WHERE ce.customer_product_id = cp.id
        ), '[]'::json) AS customer_entitlements,
        (
          SELECT row_to_json(ft)
          FROM free_trials ft
          WHERE ft.id = cp.free_trial_id
        ) AS free_trial
      FROM customer_products cp
      JOIN products prod ON cp.internal_product_id = prod.internal_id
      WHERE cp.internal_customer_id = cr.internal_id
        AND cp.status = ANY(ARRAY['active', 'past_due', 'scheduled'])
      ORDER BY prod.is_add_on ASC, cp.created_at DESC
      LIMIT 15
    ) cp_full
  ), '[]'::json) AS customer_products,

  COALESCE((
    SELECT json_agg(row_to_json(s_distinct)) FILTER (WHERE s_distinct.stripe_id IS NOT NULL)
    FROM (
      SELECT DISTINCT
        cp_sub.internal_customer_id,
        s.*
      FROM customer_products cp_sub
      CROSS JOIN LATERAL unnest(cp_sub.subscription_ids) AS sub_id_t(sub_id)
      JOIN subscriptions s ON s.stripe_id = sub_id_t.sub_id
      WHERE cp_sub.internal_customer_id = cr.internal_id
        AND cp_sub.status = ANY(ARRAY['active', 'past_due', 'scheduled'])
    ) s_distinct
  ), '[]'::json) AS subscriptions,

  COALESCE((
    SELECT json_agg(ce_full.ce_obj ORDER BY ce_full.ce_id DESC)
    FROM (
      SELECT
        ce.id AS ce_id,
        to_jsonb(ce.*) || jsonb_build_object(
          'entitlement', (
            SELECT row_to_json(ent_with_feature)
            FROM (
              SELECT e.*, row_to_json(f) AS feature
              FROM entitlements e
              JOIN features f ON e.internal_feature_id = f.internal_id
              WHERE e.id = ce.entitlement_id
            ) AS ent_with_feature
          ),
          'replaceables', COALESCE((
            SELECT json_agg(row_to_json(r)) FILTER (WHERE r.id IS NOT NULL)
            FROM replaceables r
            WHERE r.cus_ent_id = ce.id
          ), '[]'::json),
          'rollovers', COALESCE((
            SELECT json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST)
            FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL)
            FROM rollovers ro
            WHERE ro.cus_ent_id = ce.id
          ), '[]'::json)
        ) AS ce_obj
      FROM customer_entitlements ce
      WHERE ce.internal_customer_id = cr.internal_id
        AND ce.customer_product_id IS NULL
        AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
      ORDER BY ce.id DESC
      LIMIT 30
    ) ce_full
  ), '[]'::json) AS extra_customer_entitlements

FROM customer_records cr
ORDER BY cr.created_at DESC, cr.id DESC;
