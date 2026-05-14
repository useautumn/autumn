-- ============================================================
-- Variant 04: LATERAL for leaves too
-- Page 1, limit=1000
-- Target org: Firecrawl
--
-- Hypothesis: variant 03's killer was the planner choosing a
-- Merge Join over the full entitlements table because the
-- ce_keys CTE row estimate was 100x off (206k est, 2.8k real).
-- Same in features (53k seq scan + 17MB hash).
--
-- Fix: wrap each leaf bulk fetch in CROSS JOIN LATERAL so the
-- inner subquery executes per-driver-row — forces nested loop
-- index scan regardless of CTE cardinality estimates.
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT)
WITH cr AS MATERIALIZED (
  SELECT c.*
  FROM customers c
  WHERE c.org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'
    AND c.env = 'live'
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT 1001
),

cps_flat AS MATERIALIZED (
  SELECT
    cp.*,
    row_to_json(prod) AS product
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
  SELECT ce.*
  FROM cps_flat
  JOIN LATERAL (
    SELECT ce.*
    FROM customer_entitlements ce
    WHERE ce.customer_product_id = cps_flat.id
  ) ce ON true
),

ces_loose AS MATERIALIZED (
  SELECT ce.*
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

ce_keys AS MATERIALIZED (
  SELECT id, entitlement_id FROM ces_bound
  UNION ALL
  SELECT id, entitlement_id FROM ces_loose
)

SELECT
  (SELECT COALESCE(jsonb_agg(to_jsonb(x.*) ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)
   FROM cr x) AS customers,

  (SELECT COALESCE(jsonb_agg(to_jsonb(x.*)), '[]'::jsonb)
   FROM cps_flat x) AS customer_products,

  (SELECT COALESCE(jsonb_agg(to_jsonb(x.*)), '[]'::jsonb)
   FROM ces_bound x) AS customer_entitlements,

  (SELECT COALESCE(jsonb_agg(to_jsonb(x.*)), '[]'::jsonb)
   FROM ces_loose x) AS extra_customer_entitlements,

  (SELECT COALESCE(jsonb_agg(to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))), '[]'::jsonb)
   FROM cps_flat cps
   CROSS JOIN LATERAL (
     SELECT cpr.*
     FROM customer_prices cpr
     WHERE cpr.customer_product_id = cps.id
   ) cpr
   LEFT JOIN LATERAL (
     SELECT p.*
     FROM prices p
     WHERE p.id = cpr.price_id
   ) p ON true) AS customer_prices,

  (SELECT COALESCE(jsonb_agg(to_jsonb(e.*) || jsonb_build_object('feature', to_jsonb(f.*))), '[]'::jsonb)
   FROM ce_keys ck
   CROSS JOIN LATERAL (
     SELECT e.*
     FROM entitlements e
     WHERE e.id = ck.entitlement_id
   ) e
   CROSS JOIN LATERAL (
     SELECT f.*
     FROM features f
     WHERE f.internal_id = e.internal_feature_id
   ) f) AS entitlements,

  (SELECT COALESCE(jsonb_agg(to_jsonb(ro.*)), '[]'::jsonb)
   FROM ce_keys ck
   CROSS JOIN LATERAL (
     SELECT ro.*
     FROM rollovers ro
     WHERE ro.cus_ent_id = ck.id
       AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
   ) ro) AS rollovers,

  (SELECT COALESCE(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb)
   FROM ce_keys ck
   CROSS JOIN LATERAL (
     SELECT r.*
     FROM replaceables r
     WHERE r.cus_ent_id = ck.id
   ) r) AS replaceables,

  (SELECT COALESCE(jsonb_agg(to_jsonb(ft.*)), '[]'::jsonb)
   FROM cps_flat cps
   CROSS JOIN LATERAL (
     SELECT ft.*
     FROM free_trials ft
     WHERE ft.id = cps.free_trial_id
   ) ft
   WHERE cps.free_trial_id IS NOT NULL) AS free_trials,

  (SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb)
   FROM (
     SELECT DISTINCT s.*
     FROM cps_flat cps
     CROSS JOIN LATERAL unnest(cps.subscription_ids) AS sub_id_t(sub_id)
     CROSS JOIN LATERAL (
       SELECT s.*
       FROM subscriptions s
       WHERE s.stripe_id = sub_id_t.sub_id
     ) s
     WHERE cps.subscription_ids IS NOT NULL
   ) s) AS subscriptions;
