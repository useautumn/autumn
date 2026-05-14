-- ============================================================
-- Variant 00: baseline (current getCursorPaginatedFullCusQuery)
-- Deep page (cursor ≈ 45% of 1.22M customers), limit=1000
-- Target org: Firecrawl
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT)
WITH customer_records AS (
  SELECT c.*
  FROM customers c
  WHERE c.org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'
    AND c.env = 'live'
    AND (c.created_at, c.id) < (1774237983361, '772c9569-fc97-4c30-9fd8-c8a585b66755')
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT 1001
),

customer_products_with_prices AS (
  SELECT
    cp.*,
    row_to_json(prod) AS product,
    cpr_data.customer_prices,
    ce_data.customer_entitlements,
    ft_data.free_trial
  FROM customer_records cr
  JOIN LATERAL (
    SELECT *
    FROM customer_products cp
    WHERE cp.internal_customer_id = cr.internal_id
      AND cp.status = ANY(ARRAY['active', 'past_due', 'scheduled'])
    ORDER BY (SELECT p.is_add_on FROM products p WHERE p.internal_id = cp.internal_product_id) ASC, cp.created_at DESC
    LIMIT 15
  ) cp ON true
  JOIN products prod ON cp.internal_product_id = prod.internal_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      json_agg(
        to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))
      ) FILTER (WHERE cpr.id IS NOT NULL),
      '[]'::json
    ) AS customer_prices
    FROM customer_prices cpr
    LEFT JOIN prices p ON cpr.price_id = p.id
    WHERE cpr.customer_product_id = cp.id
  ) cpr_data ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      json_agg(
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
          'replaceables', (
            SELECT COALESCE(
              json_agg(row_to_json(r)) FILTER (WHERE r.id IS NOT NULL),
              '[]'::json
            )
            FROM replaceables r
            WHERE r.cus_ent_id = ce.id
          ),
          'rollovers', (
            SELECT COALESCE(
              json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST) FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL),
              '[]'::json
            )
            FROM rollovers ro
            WHERE ro.cus_ent_id = ce.id
          )
        )
      ) FILTER (WHERE ce.id IS NOT NULL),
      '[]'::json
    ) AS customer_entitlements
    FROM customer_entitlements ce
    WHERE ce.customer_product_id = cp.id
  ) ce_data ON true
  LEFT JOIN LATERAL (
    SELECT row_to_json(ft) AS free_trial
    FROM free_trials ft
    WHERE ft.id = cp.free_trial_id
  ) ft_data ON true
),

customer_products_aggregated AS (
  SELECT
    cpwp.internal_customer_id,
    json_agg(row_to_json(cpwp) ORDER BY cpwp.created_at DESC) AS customer_products
  FROM customer_products_with_prices cpwp
  GROUP BY cpwp.internal_customer_id
),

customer_subscriptions AS (
  SELECT
    s.internal_customer_id,
    COALESCE(
      json_agg(row_to_json(s)) FILTER (WHERE s.stripe_id IS NOT NULL),
      '[]'::json
    ) AS subscriptions
  FROM (
    SELECT DISTINCT
      cpwp.internal_customer_id,
      s.*
    FROM customer_products_with_prices cpwp
    JOIN LATERAL unnest(cpwp.subscription_ids) AS cpwp_sub(stripe_id) ON true
    JOIN subscriptions s ON s.stripe_id = cpwp_sub.stripe_id
  ) s
  GROUP BY s.internal_customer_id
),

extra_customer_entitlements AS (
  SELECT
    cr.internal_id AS internal_customer_id,
    COALESCE(
      json_agg(
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
          'replaceables', (
            SELECT COALESCE(
              json_agg(row_to_json(r)) FILTER (WHERE r.id IS NOT NULL),
              '[]'::json
            )
            FROM replaceables r
            WHERE r.cus_ent_id = ce.id
          ),
          'rollovers', (
            SELECT COALESCE(
              json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST)
              FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL),
              '[]'::json
            )
            FROM rollovers ro
            WHERE ro.cus_ent_id = ce.id
          )
        )
        ORDER BY ce.id DESC
      ) FILTER (WHERE ce.id IS NOT NULL),
      '[]'::json
    ) AS extra_customer_entitlements
  FROM customer_records cr
  LEFT JOIN LATERAL (
    SELECT *
    FROM customer_entitlements ce
    WHERE ce.internal_customer_id = cr.internal_id
      AND ce.customer_product_id IS NULL
      AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
    ORDER BY ce.id DESC
    LIMIT 30
  ) ce ON true
  GROUP BY cr.internal_id
)

SELECT
  cr.*,
  COALESCE(cpa.customer_products, '[]'::json) AS customer_products,
  COALESCE(cs.subscriptions, '[]'::json) AS subscriptions,
  COALESCE(ece.extra_customer_entitlements, '[]'::json) AS extra_customer_entitlements
FROM customer_records cr
LEFT JOIN customer_products_aggregated cpa ON cpa.internal_customer_id = cr.internal_id
LEFT JOIN customer_subscriptions cs ON cs.internal_customer_id = cr.internal_id
LEFT JOIN extra_customer_entitlements ece ON ece.internal_customer_id = cr.internal_id
ORDER BY cr.created_at DESC, cr.id DESC;
