-- ============================================================
-- Variant 09: variant 07 + SQL-side reassembly into nested shape
-- Page 1, limit=1000
-- Target org: Firecrawl
--
-- Variant 07 returns 10 flat top-level arrays (app must rebuild
-- nested hierarchy). This variant adds GROUP BY reassembly so
-- the final result is one row { list: [...customers with full
-- nested hierarchy...] } — same shape as the current handler.
--
-- Cost: extra GROUP BY passes (~6 of them) over the materialized
-- CTEs. Should pick HashAggregate (not GroupAggregate with the
-- COLLATE-C sort that killed the baseline). Expected: +30-60ms
-- on top of variant 07's 128ms.
--
-- Key additions vs variant 07:
--   - ces_combined CTE now also stores internal_customer_id and
--     customer_product_id for GROUP BY
--   - Six "by_<parent>" CTEs that hash-group leaves under their
--     parent
--   - Final SELECT joins cr × cps_by_cus × subs_by_cus ×
--     loose_ces_by_cus and emits one customer object per row
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
    (row_to_json(cp)::jsonb || jsonb_build_object('product', row_to_json(prod)))::jsonb AS row_jsonb
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
  SELECT
    'bound'::text AS kind,
    ce.id,
    ce.entitlement_id,
    ce.internal_customer_id,
    ce.customer_product_id,
    row_to_json(ce)::jsonb AS row_jsonb
  FROM cps_flat
  JOIN LATERAL (
    SELECT ce.*
    FROM customer_entitlements ce
    WHERE ce.customer_product_id = cps_flat.id
  ) ce ON true
  UNION ALL
  SELECT
    'loose'::text AS kind,
    ce.id,
    ce.entitlement_id,
    ce.internal_customer_id,
    ce.customer_product_id,
    row_to_json(ce)::jsonb AS row_jsonb
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
),

-- ─── leaf lookup tables (one row per leaf, indexed by parent) ─

ents_by_id AS MATERIALIZED (
  SELECT
    e.id AS entitlement_id,
    (row_to_json(e)::jsonb || jsonb_build_object('feature', row_to_json(f)))::jsonb AS ent_obj
  FROM unnest((SELECT distinct_entitlement_ids FROM arrays)) AS u(entitlement_id)
  JOIN LATERAL (SELECT * FROM entitlements e WHERE e.id = u.entitlement_id) e ON true
  JOIN LATERAL (SELECT * FROM features f WHERE f.internal_id = e.internal_feature_id) f ON true
),

rollovers_by_ce AS MATERIALIZED (
  SELECT
    ro.cus_ent_id AS ce_id,
    jsonb_agg(row_to_json(ro)::jsonb) AS ros_arr
  FROM unnest((SELECT all_ce_ids FROM arrays)) AS u(ce_id)
  JOIN LATERAL (
    SELECT ro.*
    FROM rollovers ro
    WHERE ro.cus_ent_id = u.ce_id
      AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
  ) ro ON true
  GROUP BY ro.cus_ent_id
),

replaceables_by_ce AS MATERIALIZED (
  SELECT
    r.cus_ent_id AS ce_id,
    jsonb_agg(row_to_json(r)::jsonb) AS reps_arr
  FROM unnest((SELECT all_ce_ids FROM arrays)) AS u(ce_id)
  JOIN LATERAL (
    SELECT r.*
    FROM replaceables r
    WHERE r.cus_ent_id = u.ce_id
  ) r ON true
  GROUP BY r.cus_ent_id
),

ces_hydrated AS MATERIALIZED (
  SELECT
    ce.kind,
    ce.internal_customer_id,
    ce.customer_product_id,
    ce.id AS ce_id,
    ce.row_jsonb
      || jsonb_build_object('entitlement', e.ent_obj)
      || jsonb_build_object('rollovers', COALESCE(r.ros_arr, '[]'::jsonb))
      || jsonb_build_object('replaceables', COALESCE(rep.reps_arr, '[]'::jsonb))
      AS ce_obj
  FROM ces_combined ce
  LEFT JOIN ents_by_id e ON e.entitlement_id = ce.entitlement_id
  LEFT JOIN rollovers_by_ce r ON r.ce_id = ce.id
  LEFT JOIN replaceables_by_ce rep ON rep.ce_id = ce.id
),

ces_by_cp AS MATERIALIZED (
  SELECT
    customer_product_id AS cp_id,
    jsonb_agg(ce_obj) AS ces_arr
  FROM ces_hydrated
  WHERE kind = 'bound'
  GROUP BY customer_product_id
),

loose_ces_by_cus AS MATERIALIZED (
  SELECT
    internal_customer_id,
    jsonb_agg(ce_obj ORDER BY ce_id DESC) AS loose_arr
  FROM ces_hydrated
  WHERE kind = 'loose'
  GROUP BY internal_customer_id
),

cprs_by_cp AS MATERIALIZED (
  SELECT
    cpr.customer_product_id AS cp_id,
    jsonb_agg(row_to_json(cpr)::jsonb || jsonb_build_object('price', row_to_json(p))) AS cprs_arr
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
  ) p ON true
  GROUP BY cpr.customer_product_id
),

fts_by_id AS MATERIALIZED (
  SELECT ft.id AS ft_id, row_to_json(ft)::jsonb AS ft_obj
  FROM unnest((SELECT free_trial_ids FROM arrays)) AS u(ft_id)
  JOIN LATERAL (SELECT * FROM free_trials ft WHERE ft.id = u.ft_id) ft ON true
),

cps_hydrated AS MATERIALIZED (
  SELECT
    cps.internal_customer_id,
    cps.row_jsonb
      || jsonb_build_object('customer_prices', COALESCE(cprs.cprs_arr, '[]'::jsonb))
      || jsonb_build_object('customer_entitlements', COALESCE(ces.ces_arr, '[]'::jsonb))
      || jsonb_build_object('free_trial', ft.ft_obj)
      AS cp_obj
  FROM cps_flat cps
  LEFT JOIN cprs_by_cp cprs ON cprs.cp_id = cps.id
  LEFT JOIN ces_by_cp ces ON ces.cp_id = cps.id
  LEFT JOIN fts_by_id ft ON ft.ft_id = cps.free_trial_id
),

cps_by_cus AS MATERIALIZED (
  SELECT
    internal_customer_id,
    jsonb_agg(cp_obj) AS cps_arr
  FROM cps_hydrated
  GROUP BY internal_customer_id
),

subs_by_cus AS MATERIALIZED (
  SELECT
    cps.internal_customer_id,
    jsonb_agg(DISTINCT row_to_json(s)::jsonb) AS subs_arr
  FROM cps_flat cps
  CROSS JOIN LATERAL unnest(cps.subscription_ids) AS sub_id_t(sub_id)
  JOIN LATERAL (
    SELECT s.*
    FROM subscriptions s
    WHERE s.stripe_id = sub_id_t.sub_id
  ) s ON true
  WHERE cps.subscription_ids IS NOT NULL
  GROUP BY cps.internal_customer_id
)

SELECT jsonb_agg(
  cr.row_json::jsonb
    || jsonb_build_object('customer_products', COALESCE(cps.cps_arr, '[]'::jsonb))
    || jsonb_build_object('subscriptions', COALESCE(s.subs_arr, '[]'::jsonb))
    || jsonb_build_object('extra_customer_entitlements', COALESCE(lc.loose_arr, '[]'::jsonb))
  ORDER BY cr.created_at DESC, cr.id DESC
) AS list
FROM cr
LEFT JOIN cps_by_cus cps ON cps.internal_customer_id = cr.internal_id
LEFT JOIN subs_by_cus s ON s.internal_customer_id = cr.internal_id
LEFT JOIN loose_ces_by_cus lc ON lc.internal_customer_id = cr.internal_id;
