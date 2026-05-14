-- ============================================================
-- Deep page comparison: OLD (limit/offset) vs NEW (cursor v07)
-- Target: page at offset ~550k (45% of 1.22M customers)
-- Target org: Firecrawl
--
-- Both queries return the same shape of data (page of 1000
-- customers with full hydration). The OLD path is the current
-- v2.2 behavior (limit + offset, full CTE pipeline). The NEW
-- path is variant 07 (cursor + array fence + json_agg).
--
-- Run each EXPLAIN block separately to get clean plans.
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ OLD: limit + offset, current getPaginatedFullCusQuery    ║
-- ║ LIMIT 1000 OFFSET 550000                                 ║
-- ╚══════════════════════════════════════════════════════════╝

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT)
WITH customer_records AS (
  SELECT c.*
  FROM customers c
  WHERE c.org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'
    AND c.env = 'live'
  ORDER BY c.created_at DESC
  LIMIT 1000 OFFSET 550000
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
ORDER BY cr.created_at DESC;


-- ╔══════════════════════════════════════════════════════════╗
-- ║ NEW: variant 07 — cursor + array fence + json_agg        ║
-- ║ Deep cursor at the same boundary as OFFSET 550000        ║
-- ╚══════════════════════════════════════════════════════════╝

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT)
WITH cr AS MATERIALIZED (
  SELECT
    c.internal_id,
    c.id,
    c.created_at,
    row_to_json(c) AS row_json
  FROM customers c
  WHERE c.org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'
    AND c.env = 'live'
    AND (c.created_at, c.id) < (1774237983361, '772c9569-fc97-4c30-9fd8-c8a585b66755')
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT 1001
),

cps_flat AS MATERIALIZED (
  SELECT
    cp.id,
    cp.internal_customer_id,
    cp.internal_product_id,
    cp.free_trial_id,
    cp.subscription_ids,
    (row_to_json(cp)::jsonb || jsonb_build_object('product', row_to_json(prod)))::json AS row_json
  FROM cr
  JOIN LATERAL (
    SELECT cp.*
    FROM customer_products cp
    WHERE cp.internal_customer_id = cr.internal_id
      AND cp.status = ANY(ARRAY['active', 'past_due', 'scheduled'])
    ORDER BY cp.created_at DESC
    LIMIT 15
  ) cp ON true
  JOIN products prod ON cp.internal_product_id = prod.internal_id
),

ces_combined AS MATERIALIZED (
  SELECT 'bound'::text AS kind, ce.id, ce.entitlement_id, row_to_json(ce) AS row_json
  FROM cps_flat
  JOIN LATERAL (
    SELECT ce.*
    FROM customer_entitlements ce
    WHERE ce.customer_product_id = cps_flat.id
  ) ce ON true
  UNION ALL
  SELECT 'loose'::text AS kind, ce.id, ce.entitlement_id, row_to_json(ce) AS row_json
  FROM cr
  JOIN LATERAL (
    SELECT ce.*
    FROM customer_entitlements ce
    WHERE ce.internal_customer_id = cr.internal_id
      AND ce.customer_product_id IS NULL
      AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
    ORDER BY ce.id DESC
    LIMIT 30
  ) ce ON true
),

arrays AS MATERIALIZED (
  SELECT
    (SELECT array_agg(id) FROM ces_combined) AS all_ce_ids,
    (SELECT array_agg(DISTINCT entitlement_id) FROM ces_combined) AS distinct_entitlement_ids,
    (SELECT array_agg(DISTINCT free_trial_id) FILTER (WHERE free_trial_id IS NOT NULL) FROM cps_flat) AS free_trial_ids
)

SELECT
  (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM cr) AS customers,

  (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM cps_flat) AS customer_products,

  (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM ces_combined WHERE kind = 'bound') AS customer_entitlements,

  (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM ces_combined WHERE kind = 'loose') AS extra_customer_entitlements,

  (SELECT COALESCE(json_agg(row_to_json(cpr)::jsonb || jsonb_build_object('price', row_to_json(p))), '[]'::json)
   FROM cps_flat cps
   JOIN LATERAL (
     SELECT cpr.*
     FROM customer_prices cpr
     WHERE cpr.customer_product_id = cps.id
   ) cpr ON true
   LEFT JOIN LATERAL (
     SELECT p.*
     FROM prices p
     WHERE p.id = cpr.price_id
   ) p ON true) AS customer_prices,

  (SELECT COALESCE(json_agg(row_to_json(e)::jsonb || jsonb_build_object('feature', row_to_json(f))), '[]'::json)
   FROM unnest((SELECT distinct_entitlement_ids FROM arrays)) AS u(entitlement_id)
   JOIN LATERAL (
     SELECT e.*
     FROM entitlements e
     WHERE e.id = u.entitlement_id
   ) e ON true
   JOIN LATERAL (
     SELECT f.*
     FROM features f
     WHERE f.internal_id = e.internal_feature_id
   ) f ON true) AS entitlements,

  (SELECT COALESCE(json_agg(row_to_json(ro)), '[]'::json)
   FROM unnest((SELECT all_ce_ids FROM arrays)) AS u(ce_id)
   JOIN LATERAL (
     SELECT ro.*
     FROM rollovers ro
     WHERE ro.cus_ent_id = u.ce_id
       AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
   ) ro ON true) AS rollovers,

  (SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
   FROM unnest((SELECT all_ce_ids FROM arrays)) AS u(ce_id)
   JOIN LATERAL (
     SELECT r.*
     FROM replaceables r
     WHERE r.cus_ent_id = u.ce_id
   ) r ON true) AS replaceables,

  (SELECT COALESCE(json_agg(row_to_json(ft)), '[]'::json)
   FROM unnest((SELECT free_trial_ids FROM arrays)) AS u(ft_id)
   JOIN LATERAL (
     SELECT ft.*
     FROM free_trials ft
     WHERE ft.id = u.ft_id
   ) ft ON true) AS free_trials,

  (SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json)
   FROM (
     SELECT DISTINCT s.*
     FROM cps_flat cps
     CROSS JOIN LATERAL unnest(cps.subscription_ids) AS sub_id_t(sub_id)
     JOIN LATERAL (
       SELECT s.*
       FROM subscriptions s
       WHERE s.stripe_id = sub_id_t.sub_id
     ) s ON true
     WHERE cps.subscription_ids IS NOT NULL
   ) s) AS subscriptions;
