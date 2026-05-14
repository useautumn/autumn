-- ============================================================
-- Variant 02: flat bulk fetch (assemble in code)
-- Page 1, limit=1000
-- Target org: Firecrawl
--
-- Hypothesis: one SQL round-trip, multiple JSON columns each
-- with a bulk-IN-list fetch per relation. No per-row JSON
-- construction, no nested SubPlan per ce, no joins beyond what
-- the planner pulls into hash joins. Application assembles the
-- nested response.
--
-- Includes entity-attached cps (cps where internal_entity_id
-- matches an entity owned by a page-customer). Entities are
-- returned as a separate relation.
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

ents AS MATERIALIZED (
  SELECT e.*
  FROM entities e
  WHERE e.internal_customer_id IN (SELECT internal_id FROM cr)
),

cps_ranked AS MATERIALIZED (
  SELECT
    cp.*,
    ROW_NUMBER() OVER (
      PARTITION BY cp.internal_customer_id
      ORDER BY p.is_add_on ASC, cp.created_at DESC
    ) AS rn
  FROM customer_products cp
  JOIN products p ON p.internal_id = cp.internal_product_id
  WHERE cp.status = ANY(ARRAY['active', 'past_due', 'scheduled'])
    AND (
      cp.internal_customer_id IN (SELECT internal_id FROM cr)
      OR cp.internal_entity_id IN (SELECT internal_id FROM ents)
    )
),

cps AS MATERIALIZED (
  SELECT * FROM cps_ranked WHERE rn <= 15
),

ces AS MATERIALIZED (
  SELECT ce.*
  FROM customer_entitlements ce
  WHERE ce.customer_product_id IN (SELECT id FROM cps)
     OR (
       ce.internal_customer_id IN (SELECT internal_id FROM cr)
       AND ce.customer_product_id IS NULL
       AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
     )
)

SELECT
  (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)
   FROM cr x) AS customers,

  (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
   FROM ents x) AS entities,

  (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
   FROM cps x) AS customer_products,

  (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
   FROM products p
   WHERE p.internal_id IN (SELECT internal_product_id FROM cps)) AS products,

  (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
   FROM ces x) AS customer_entitlements,

  (SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
   FROM entitlements e
   WHERE e.id IN (SELECT entitlement_id FROM ces)) AS entitlements,

  (SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
   FROM features f
   WHERE f.internal_id IN (
     SELECT e.internal_feature_id::text
     FROM entitlements e
     WHERE e.id IN (SELECT entitlement_id FROM ces)
   )) AS features,

  (SELECT COALESCE(jsonb_agg(to_jsonb(cpr)), '[]'::jsonb)
   FROM customer_prices cpr
   WHERE cpr.customer_product_id IN (SELECT id FROM cps)) AS customer_prices,

  (SELECT COALESCE(jsonb_agg(to_jsonb(pr)), '[]'::jsonb)
   FROM prices pr
   WHERE pr.id IN (
     SELECT price_id
     FROM customer_prices
     WHERE customer_product_id IN (SELECT id FROM cps)
   )) AS prices,

  (SELECT COALESCE(jsonb_agg(to_jsonb(ro)), '[]'::jsonb)
   FROM rollovers ro
   WHERE ro.cus_ent_id IN (SELECT id FROM ces)
     AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)) AS rollovers,

  (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
   FROM replaceables r
   WHERE r.cus_ent_id IN (SELECT id FROM ces)) AS replaceables,

  (SELECT COALESCE(jsonb_agg(to_jsonb(ft)), '[]'::jsonb)
   FROM free_trials ft
   WHERE ft.id IN (
     SELECT free_trial_id FROM cps WHERE free_trial_id IS NOT NULL
   )) AS free_trials,

  (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
   FROM subscriptions s
   WHERE s.stripe_id IN (
     SELECT DISTINCT sub_id
     FROM cps
     CROSS JOIN LATERAL unnest(cps.subscription_ids) AS sub_id_t(sub_id)
     WHERE cps.subscription_ids IS NOT NULL
   )) AS subscriptions;
