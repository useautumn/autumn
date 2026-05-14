-- ============================================================
-- Variant 07: switch to json/json_agg + merge ces CTEs
-- Page 1, limit=1000
-- Target org: Firecrawl
--
-- Three tweaks vs variant 06:
--   1. Use `row_to_json` + `json_agg` instead of `to_jsonb` +
--      `jsonb_agg`. text format, no binary conversion overhead.
--   2. Merge ces_bound + ces_loose into one CTE with a kind
--      column. Saves one materialization pass + one scan.
--   3. Drop the inner Sort Key in cps_flat LATERAL — the
--      SubPlan(is_add_on) lookup per cp + sort costs ~10ms.
--      Most customers have ≤2 cps so the ordering is moot;
--      we still respect ORDER BY cp.created_at DESC.
-- ============================================================

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
