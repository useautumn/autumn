-- ============================================================
-- Variant 06: precompute jsonb at CTE build
-- Page 1, limit=1000
-- Target org: Firecrawl
--
-- Each CTE stores its row as: (fk columns needed by downstream
-- + a pre-built jsonb_blob column). The final jsonb_agg
-- just collects pre-built blobs — no per-row to_jsonb work
-- during the aggregation scan.
--
-- Expected savings: variant 05 spent ~190ms in jsonb_agg
-- across 4 wide-row CTEs. With pre-built blobs, aggregation
-- becomes a memory walk + array build (~30-50ms).
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT)
WITH cr AS MATERIALIZED (
  SELECT
    c.internal_id,
    c.id,
    c.created_at,
    to_jsonb(c.*) AS row_json
  FROM customers c
  WHERE c.org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'
    AND c.env = 'live'
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
    to_jsonb(cp.*) || jsonb_build_object('product', to_jsonb(prod.*)) AS row_json
  FROM cr
  JOIN LATERAL (
    SELECT cp.*
    FROM customer_products cp
    WHERE cp.internal_customer_id = cr.internal_id
      AND cp.status = ANY(ARRAY['active', 'past_due', 'scheduled'])
    ORDER BY (
      SELECT p.is_add_on FROM products p WHERE p.internal_id = cp.internal_product_id
    ) ASC, cp.created_at DESC
    LIMIT 15
  ) cp ON true
  JOIN products prod ON cp.internal_product_id = prod.internal_id
),

ces_bound AS MATERIALIZED (
  SELECT
    ce.id,
    ce.entitlement_id,
    to_jsonb(ce.*) AS row_json
  FROM cps_flat
  JOIN LATERAL (
    SELECT ce.*
    FROM customer_entitlements ce
    WHERE ce.customer_product_id = cps_flat.id
  ) ce ON true
),

ces_loose AS MATERIALIZED (
  SELECT
    ce.id,
    ce.entitlement_id,
    to_jsonb(ce.*) AS row_json
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

ce_arrays AS MATERIALIZED (
  SELECT
    array_agg(id) AS all_ids,
    array_agg(DISTINCT entitlement_id) AS distinct_entitlement_ids
  FROM (
    SELECT id, entitlement_id FROM ces_bound
    UNION ALL
    SELECT id, entitlement_id FROM ces_loose
  ) _
),

cps_arrays AS MATERIALIZED (
  SELECT
    array_agg(DISTINCT free_trial_id) FILTER (WHERE free_trial_id IS NOT NULL) AS free_trial_ids
  FROM cps_flat
)

SELECT
  (SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) FROM cr) AS customers,

  (SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) FROM cps_flat) AS customer_products,

  (SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) FROM ces_bound) AS customer_entitlements,

  (SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) FROM ces_loose) AS extra_customer_entitlements,

  (SELECT COALESCE(jsonb_agg(to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))), '[]'::jsonb)
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

  (SELECT COALESCE(jsonb_agg(to_jsonb(e.*) || jsonb_build_object('feature', to_jsonb(f.*))), '[]'::jsonb)
   FROM unnest((SELECT distinct_entitlement_ids FROM ce_arrays)) AS u(entitlement_id)
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

  (SELECT COALESCE(jsonb_agg(to_jsonb(ro.*)), '[]'::jsonb)
   FROM unnest((SELECT all_ids FROM ce_arrays)) AS u(ce_id)
   JOIN LATERAL (
     SELECT ro.*
     FROM rollovers ro
     WHERE ro.cus_ent_id = u.ce_id
       AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
   ) ro ON true) AS rollovers,

  (SELECT COALESCE(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb)
   FROM unnest((SELECT all_ids FROM ce_arrays)) AS u(ce_id)
   JOIN LATERAL (
     SELECT r.*
     FROM replaceables r
     WHERE r.cus_ent_id = u.ce_id
   ) r ON true) AS replaceables,

  (SELECT COALESCE(jsonb_agg(to_jsonb(ft.*)), '[]'::jsonb)
   FROM unnest((SELECT free_trial_ids FROM cps_arrays)) AS u(ft_id)
   JOIN LATERAL (
     SELECT ft.*
     FROM free_trials ft
     WHERE ft.id = u.ft_id
   ) ft ON true) AS free_trials,

  (SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb)
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
