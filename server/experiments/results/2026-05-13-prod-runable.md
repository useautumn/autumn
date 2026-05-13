# Pagination Benchmark — 2026-05-13 — prod / runable

## Config

- org_id: `r7pwHiekGsqt32qGqcVku6thWFh5aHh8`
- env: `live`
- revenuecat_customers: `1,261`
- deep_offset (45% within revcat subset): `567`
- deep_cursor (revcat-aware): `{ t: 1777225699690, id: PL6dMZw5mewXCvW74aPOOaZ28TVh5K8T }`
- limit: `1000`
- repeats per cell: 5
- statement_timeout_ms: 30000
- read_only: true
- focus: revenuecat filter (single SQL call, cursor + EXISTS combined)
- partial index in place: idx_customer_products_revenuecat_processor

## Results

| # | Cell | Rows | median ms | p95 ms | min ms | max ms | Error |
|---|------|------|-----------|--------|--------|--------|-------|
| 10 | cursor / revcat=true / first page / limit 1000 | 1001 | 3055.60 | 3146.11 | 2291.71 | 3146.11 |  |
| 11 | cursor / revcat=true / deep / limit 1000 | 693 | 2228.11 | 2701.16 | 2191.98 | 2701.16 |  |

## EXPLAIN ANALYZE

### 10 cursor / revcat=true / first page / limit 1000

```
Sort  (cost=109707.61..109710.11 rows=1001 width=609) (actual time=399.883..613.996 rows=1001.00 loops=1)
  Sort Key: cr.created_at DESC, cr.id DESC
  Sort Method: quicksort  Memory: 5988kB
  Buffers: shared hit=1382434
  CTE customer_records
    ->  Limit  (cost=1000.89..37454.69 rows=1001 width=573) (actual time=120.191..351.949 rows=1001.00 loops=1)
          Buffers: shared hit=1327851
          ->  Gather Merge  (cost=1000.89..365247.54 rows=10002 width=573) (actual time=120.190..351.839 rows=1001.00 loops=1)
                Workers Planned: 4
                Workers Launched: 4
                Buffers: shared hit=1327851
                ->  Nested Loop Semi Join  (cost=0.83..363056.15 rows=2500 width=573) (actual time=1.776..379.424 rows=249.40 loops=5)
                      Buffers: shared hit=1327807
                      ->  Parallel Index Scan using idx_customers_cursor on customers c  (cost=0.56..247810.82 rows=240186 width=573) (actual time=0.038..224.128 rows=92305.60 loops=5)
                            Index Cond: ((org_id = 'r7pwHiekGsqt32qGqcVku6thWFh5aHh8'::text) AND (env = 'live'::text))
                            Index Searches: 1
                            Buffers: shared hit=403105
                      ->  Index Only Scan using idx_customer_products_revenuecat_processor on customer_products cp_processor  (cost=0.28..0.48 rows=1 width=32) (actual time=0.001..0.001 rows=0.00 loops=461528)
                            Index Cond: (internal_customer_id = c.internal_id)
                            Heap Fetches: 1057
                            Index Searches: 461528
                            Buffers: shared hit=924702
  CTE customer_products_with_prices
    ->  Nested Loop Left Join  (cost=1016.52..12367.59 rows=2002 width=678) (actual time=0.492..248.636 rows=1045.00 loops=1)
          Buffers: shared hit=52735
          ->  Nested Loop Left Join  (cost=1016.22..12301.53 rows=2002 width=864) (actual time=0.480..243.772 rows=1045.00 loops=1)
                Buffers: shared hit=52735
                ->  Nested Loop Left Join  (cost=16.29..9252.69 rows=2002 width=832) (actual time=0.191..81.148 rows=1045.00 loops=1)
                      Buffers: shared hit=19822
                      ->  Nested Loop  (cost=9.48..9182.21 rows=2002 width=800) (actual time=0.085..40.398 rows=1045.00 loops=1)
                            Buffers: shared hit=11482
                            ->  Nested Loop  (cost=9.05..9125.77 rows=2002 width=550) (actual time=0.055..39.523 rows=1045.00 loops=1)
                                  Buffers: shared hit=11442
                                  ->  CTE Scan on customer_records cr_2  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.000..18.146 rows=1001.00 loops=1)
                                        Storage: Memory  Maximum Storage: 270kB
                                        Buffers: shared hit=1199
                                  ->  Limit  (cost=9.05..9.06 rows=2 width=551) (actual time=0.020..0.021 rows=1.04 loops=1001)
                                        Buffers: shared hit=10243
                                        ->  Sort  (cost=9.05..9.06 rows=2 width=551) (actual time=0.020..0.020 rows=1.04 loops=1001)
                                              Sort Key: ((SubPlan 2)), cp.created_at DESC
                                              Sort Method: quicksort  Memory: 25kB
                                              Buffers: shared hit=10243
                                              ->  Index Scan using customer_products_internal_customer_id_idx on customer_products cp  (cost=0.56..9.04 rows=2 width=551) (actual time=0.016..0.017 rows=1.04 loops=1001)
                                                    Index Cond: (internal_customer_id = cr_2.internal_id)
                                                    Filter: (status = ANY ('{active,past_due,scheduled}'::text[]))
                                                    Rows Removed by Filter: 1
                                                    Index Searches: 1001
                                                    Buffers: shared hit=10243
                                                    SubPlan 2
                                                      ->  Index Scan using plans_pkey on products p  (cost=0.41..2.13 rows=1 width=1) (actual time=0.005..0.006 rows=1.00 loops=1045)
                                                            Index Cond: (internal_id = cp.internal_product_id)
                                                            Index Searches: 1045
                                                            Buffers: shared hit=4180
                            ->  Memoize  (cost=0.42..2.14 rows=1 width=282) (actual time=0.000..0.000 rows=1.00 loops=1045)
                                  Cache Key: cp.internal_product_id
                                  Cache Mode: logical
                                  Hits: 1035  Misses: 10  Evictions: 0  Overflows: 0  Memory Usage: 4kB
                                  Buffers: shared hit=40
                                  ->  Index Scan using plans_pkey on products prod  (cost=0.41..2.13 rows=1 width=282) (actual time=0.008..0.008 rows=1.00 loops=10)
                                        Index Cond: (internal_id = cp.internal_product_id)
                                        Index Searches: 10
                                        Buffers: shared hit=40
                      ->  Memoize  (cost=6.81..6.82 rows=1 width=32) (actual time=0.038..0.038 rows=1.00 loops=1045)
                            Cache Key: cp.id
                            Cache Mode: binary
                            Hits: 0  Misses: 1045  Evictions: 0  Overflows: 0  Memory Usage: 915kB
                            Buffers: shared hit=8340
                            ->  Aggregate  (cost=6.80..6.81 rows=1 width=32) (actual time=0.037..0.037 rows=1.00 loops=1045)
                                  Buffers: shared hit=8340
                                  ->  Nested Loop Left Join  (cost=0.84..6.78 rows=2 width=871) (actual time=0.016..0.016 rows=1.00 loops=1045)
                                        Buffers: shared hit=8340
                                        ->  Index Scan using idx_customer_prices_product_id on customer_prices cpr  (cost=0.42..2.51 rows=2 width=269) (actual time=0.012..0.013 rows=1.00 loops=1045)
                                              Index Cond: (customer_product_id = cp.id)
                                              Index Searches: 1045
                                              Buffers: shared hit=4176
                                        ->  Index Scan using prices_pkey on prices p_1  (cost=0.42..2.13 rows=1 width=664) (actual time=0.003..0.003 rows=1.00 loops=1041)
                                              Index Cond: (id = cpr.price_id)
                                              Index Searches: 1041
                                              Buffers: shared hit=4164
                ->  Memoize  (cost=999.93..999.94 rows=1 width=32) (actual time=0.155..0.155 rows=1.00 loops=1045)
                      Cache Key: cp.id
                      Cache Mode: binary
                      Hits: 0  Misses: 1045  Evictions: 0  Overflows: 0  Memory Usage: 3760kB
                      Buffers: shared hit=32913
                      ->  Aggregate  (cost=999.92..999.93 rows=1 width=32) (actual time=0.153..0.153 rows=1.00 loops=1045)
                            Buffers: shared hit=32913
                            ->  Index Scan using idx_customer_entitlements_product_id on customer_entitlements ce_2  (cost=0.56..78.98 rows=106 width=537) (actual time=0.015..0.018 rows=1.97 loops=1045)
                                  Index Cond: (customer_product_id = cp.id)
                                  Index Searches: 1045
                                  Buffers: shared hit=6094
                            SubPlan 3
                              ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.015..0.016 rows=1.00 loops=2063)
                                    Buffers: shared hit=16504
                                    ->  Index Scan using entitlements_pkey on entitlements e  (cost=0.43..2.15 rows=1 width=359) (actual time=0.002..0.003 rows=1.00 loops=2063)
                                          Index Cond: (id = ce_2.entitlement_id)
                                          Index Searches: 2063
                                          Buffers: shared hit=8252
                                    ->  Index Scan using features_pkey on features f  (cost=0.41..2.13 rows=1 width=349) (actual time=0.003..0.003 rows=1.00 loops=2063)
                                          Index Cond: (internal_id = (e.internal_feature_id)::text)
                                          Index Searches: 2063
                                          Buffers: shared hit=8252
                            SubPlan 4
                              ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.003..0.003 rows=1.00 loops=2063)
                                    Buffers: shared hit=2063
                                    ->  Seq Scan on replaceables r  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=2063)
                                          Filter: (cus_ent_id = ce_2.id)
                                          Rows Removed by Filter: 21
                                          Buffers: shared hit=2063
                            SubPlan 5
                              ->  Aggregate  (cost=3.24..3.25 rows=1 width=32) (actual time=0.010..0.010 rows=1.00 loops=2063)
                                    Buffers: shared hit=8252
                                    ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro  (cost=0.56..3.17 rows=4 width=125) (actual time=0.008..0.008 rows=0.00 loops=2063)
                                          Index Cond: (cus_ent_id = ce_2.id)
                                          Index Searches: 2063
                                          Buffers: shared hit=8252
          ->  Memoize  (cost=0.30..2.01 rows=1 width=139) (actual time=0.000..0.000 rows=0.00 loops=1045)
                Cache Key: cp.free_trial_id
                Cache Mode: logical
                Hits: 1044  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                ->  Index Scan using free_trials_pkey on free_trials ft  (cost=0.29..2.00 rows=1 width=139) (actual time=0.001..0.001 rows=0.00 loops=1)
                      Index Cond: (id = cp.free_trial_id)
                      Index Searches: 0
  ->  Hash Right Join  (cost=7588.29..59835.44 rows=1001 width=609) (actual time=396.315..398.203 rows=1001.00 loops=1)
        Hash Cond: (cr_1.internal_id = cr.internal_id)
        Buffers: shared hit=56512
        ->  GroupAggregate  (cost=7113.76..59337.13 rows=1001 width=64) (actual time=5.530..6.762 rows=1001.00 loops=1)
              Group Key: cr_1.internal_id
              Buffers: shared hit=3003
              ->  Sort  (cost=7113.76..7128.78 rows=6006 width=569) (actual time=5.521..5.619 rows=1001.00 loops=1)
                    Sort Key: cr_1.internal_id COLLATE "C"
                    Sort Method: quicksort  Memory: 71kB
                    Buffers: shared hit=3003
                    ->  Nested Loop Left Join  (cost=6.58..6736.82 rows=6006 width=569) (actual time=0.028..5.076 rows=1001.00 loops=1)
                          Buffers: shared hit=3003
                          ->  CTE Scan on customer_records cr_1  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.001..0.184 rows=1001.00 loops=1)
                                Storage: Memory  Maximum Storage: 270kB
                          ->  Subquery Scan on ce  (cost=6.58..6.65 rows=6 width=537) (actual time=0.005..0.005 rows=0.00 loops=1001)
                                Buffers: shared hit=3003
                                ->  Limit  (cost=6.58..6.59 rows=6 width=445) (actual time=0.004..0.004 rows=0.00 loops=1001)
                                      Buffers: shared hit=3003
                                      ->  Sort  (cost=6.58..6.59 rows=6 width=445) (actual time=0.004..0.004 rows=0.00 loops=1001)
                                            Sort Key: ce_1.id DESC
                                            Sort Method: quicksort  Memory: 25kB
                                            Buffers: shared hit=3003
                                            ->  Index Scan using idx_customer_entitlements_loose_customer_expires on customer_entitlements ce_1  (cost=0.43..6.50 rows=6 width=445) (actual time=0.003..0.003 rows=0.00 loops=1001)
                                                  Index Cond: (internal_customer_id = cr_1.internal_id)
                                                  Filter: ((expires_at IS NULL) OR (expires_at > (EXTRACT(epoch FROM now()) * '1000'::numeric)))
                                                  Index Searches: 1001
                                                  Buffers: shared hit=3003
              SubPlan 7
                ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (never executed)
                      ->  Index Scan using entitlements_pkey on entitlements e_1  (cost=0.43..2.15 rows=1 width=359) (never executed)
                            Index Cond: (id = ce.entitlement_id)
                            Index Searches: 0
                      ->  Index Scan using features_pkey on features f_1  (cost=0.41..2.13 rows=1 width=349) (never executed)
                            Index Cond: (internal_id = (e_1.internal_feature_id)::text)
                            Index Searches: 0
              SubPlan 8
                ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (never executed)
                      ->  Seq Scan on replaceables r_1  (cost=0.00..1.12 rows=2 width=154) (never executed)
                            Filter: (cus_ent_id = ce.id)
              SubPlan 9
                ->  Aggregate  (cost=3.24..3.25 rows=1 width=32) (never executed)
                      ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro_1  (cost=0.56..3.17 rows=4 width=125) (never executed)
                            Index Cond: (cus_ent_id = ce.id)
                            Index Searches: 0
        ->  Hash  (cost=462.02..462.02 rows=1001 width=577) (actual time=390.778..390.788 rows=1001.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 5979kB
              Buffers: shared hit=53509
              ->  Hash Left Join  (cost=436.72..462.02 rows=1001 width=577) (actual time=387.992..389.081 rows=1001.00 loops=1)
                    Hash Cond: (cr.internal_id = cs.internal_customer_id)
                    Buffers: shared hit=53509
                    ->  Hash Left Join  (cost=183.56..206.22 rows=1001 width=545) (actual time=385.907..386.673 rows=1001.00 loops=1)
                          Hash Cond: (cr.internal_id = cpa.internal_customer_id)
                          Buffers: shared hit=53465
                          ->  CTE Scan on customer_records cr  (cost=0.00..20.02 rows=1001 width=513) (actual time=120.195..120.317 rows=1001.00 loops=1)
                                Storage: Memory  Maximum Storage: 270kB
                                Buffers: shared hit=730
                          ->  Hash  (cost=178.66..178.66 rows=392 width=64) (actual time=265.704..265.706 rows=998.00 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 5778kB
                                Buffers: shared hit=52735
                                ->  Subquery Scan on cpa  (cost=149.82..178.66 rows=392 width=64) (actual time=253.574..264.956 rows=998.00 loops=1)
                                      Buffers: shared hit=52735
                                      ->  GroupAggregate  (cost=149.82..174.74 rows=392 width=64) (actual time=253.572..264.783 rows=998.00 loops=1)
                                            Group Key: cpwp.internal_customer_id
                                            Buffers: shared hit=52735
                                            ->  Sort  (cost=149.82..154.83 rows=2002 width=152) (actual time=253.550..253.776 rows=1045.00 loops=1)
                                                  Sort Key: cpwp.internal_customer_id COLLATE "C", cpwp.created_at DESC
                                                  Sort Method: quicksort  Memory: 5253kB
                                                  Buffers: shared hit=52735
                                                  ->  CTE Scan on customer_products_with_prices cpwp  (cost=0.00..40.04 rows=2002 width=152) (actual time=0.506..252.288 rows=1045.00 loops=1)
                                                        Storage: Memory  Maximum Storage: 5161kB
                                                        Buffers: shared hit=52735
                    ->  Hash  (cost=250.66..250.66 rows=200 width=64) (actual time=2.081..2.087 rows=11.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 13kB
                          Buffers: shared hit=44
                          ->  Subquery Scan on cs  (cost=246.16..250.66 rows=200 width=64) (actual time=2.071..2.080 rows=11.00 loops=1)
                                Buffers: shared hit=44
                                ->  HashAggregate  (cost=246.16..248.66 rows=200 width=64) (actual time=2.070..2.077 rows=11.00 loops=1)
                                      Group Key: s.internal_customer_id
                                      Batches: 1  Memory Usage: 40kB
                                      Buffers: shared hit=44
                                      ->  Subquery Scan on s  (cost=190.28..230.92 rows=2032 width=298) (actual time=1.993..2.021 rows=11.00 loops=1)
                                            Buffers: shared hit=44
                                            ->  HashAggregate  (cost=190.28..210.60 rows=2032 width=213) (actual time=1.987..2.008 rows=11.00 loops=1)
                                                  Group Key: cpwp_1.internal_customer_id, s_1.id, s_1.stripe_id, s_1.stripe_schedule_id, s_1.created_at, s_1.usage_features, s_1.metadata, s_1.org_id, s_1.env, s_1.current_period_start, s_1.current_period_end
                                                  Batches: 1  Memory Usage: 105kB
                                                  Buffers: shared hit=44
                                                  ->  Nested Loop  (cost=0.43..134.40 rows=2032 width=213) (actual time=0.308..1.964 rows=11.00 loops=1)
                                                        Buffers: shared hit=44
                                                        ->  Nested Loop  (cost=0.00..80.08 rows=2002 width=64) (actual time=0.277..1.821 rows=11.00 loops=1)
                                                              ->  CTE Scan on customer_products_with_prices cpwp_1  (cost=0.00..40.04 rows=2002 width=64) (actual time=0.001..0.812 rows=1045.00 loops=1)
                                                                    Storage: Memory  Maximum Storage: 5161kB
                                                              ->  Function Scan on unnest cpwp_sub  (cost=0.00..0.01 rows=1 width=32) (actual time=0.001..0.001 rows=0.01 loops=1045)
                                                        ->  Memoize  (cost=0.43..2.15 rows=1 width=181) (actual time=0.012..0.012 rows=1.00 loops=11)
                                                              Cache Key: cpwp_sub.stripe_id
                                                              Cache Mode: logical
                                                              Hits: 0  Misses: 11  Evictions: 0  Overflows: 0  Memory Usage: 3kB
                                                              Buffers: shared hit=44
                                                              ->  Index Scan using idx_subscriptions_stripe_id on subscriptions s_1  (cost=0.42..2.14 rows=1 width=181) (actual time=0.011..0.011 rows=1.00 loops=11)
                                                                    Index Cond: (stripe_id = cpwp_sub.stripe_id)
                                                                    Index Searches: 11
                                                                    Buffers: shared hit=44
Planning:
  Buffers: shared hit=60
Planning Time: 3.327 ms
Execution Time: 614.472 ms
```

### 11 cursor / revcat=true / deep / limit 1000

```
Sort  (cost=112019.84..112022.34 rows=1001 width=609) (actual time=2205.369..2320.704 rows=693.00 loops=1)
  Sort Key: cr.created_at DESC, cr.id DESC
  Sort Method: quicksort  Memory: 4193kB
  Buffers: shared hit=2452594
  CTE customer_records
    ->  Limit  (cost=1000.89..39766.92 rows=1001 width=573) (actual time=56.375..2053.986 rows=693.00 loops=1)
          Buffers: shared hit=2414231
          ->  Gather Merge  (cost=1000.89..360622.59 rows=9286 width=573) (actual time=56.374..2053.876 rows=693.00 loops=1)
                Workers Planned: 4
                Workers Launched: 1
                Buffers: shared hit=2414231
                ->  Nested Loop Semi Join  (cost=0.83..358516.48 rows=2322 width=573) (actual time=1.034..1090.229 rows=346.50 loops=2)
                      Buffers: shared hit=2414220
                      ->  Parallel Index Scan using idx_customers_cursor on customers c  (cost=0.56..248348.63 rows=222980 width=573) (actual time=0.046..513.658 rows=414514.50 loops=2)
                            Index Cond: ((org_id = 'r7pwHiekGsqt32qGqcVku6thWFh5aHh8'::text) AND (env = 'live'::text) AND (ROW(created_at, id) < ROW('1777225699690'::numeric, 'PL6dMZw5mewXCvW74aPOOaZ28TVh5K8T'::text)))
                            Index Searches: 1
                            Buffers: shared hit=755243
                      ->  Index Only Scan using idx_customer_products_revenuecat_processor on customer_products cp_processor  (cost=0.28..0.49 rows=1 width=32) (actual time=0.001..0.001 rows=0.00 loops=829029)
                            Index Cond: (internal_customer_id = c.internal_id)
                            Heap Fetches: 549
                            Index Searches: 829029
                            Buffers: shared hit=1658977
  CTE customer_products_with_prices
    ->  Nested Loop Left Join  (cost=1016.52..12367.59 rows=2002 width=678) (actual time=0.715..2127.082 rows=717.00 loops=1)
          Buffers: shared hit=47511
          ->  Nested Loop Left Join  (cost=1016.22..12301.53 rows=2002 width=864) (actual time=0.703..2123.189 rows=717.00 loops=1)
                Buffers: shared hit=47511
                ->  Nested Loop Left Join  (cost=16.29..9252.69 rows=2002 width=832) (actual time=0.404..1952.023 rows=717.00 loops=1)
                      Buffers: shared hit=24135
                      ->  Nested Loop  (cost=9.48..9182.21 rows=2002 width=800) (actual time=0.319..1903.139 rows=717.00 loops=1)
                            Buffers: shared hit=18469
                            ->  Nested Loop  (cost=9.05..9125.77 rows=2002 width=550) (actual time=0.057..1901.977 rows=717.00 loops=1)
                                  Buffers: shared hit=18413
                                  ->  CTE Scan on customer_records cr_2  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.000..1882.687 rows=693.00 loops=1)
                                        Storage: Memory  Maximum Storage: 192kB
                                        Buffers: shared hit=11255
                                  ->  Limit  (cost=9.05..9.06 rows=2 width=551) (actual time=0.027..0.027 rows=1.03 loops=693)
                                        Buffers: shared hit=7158
                                        ->  Sort  (cost=9.05..9.06 rows=2 width=551) (actual time=0.026..0.026 rows=1.03 loops=693)
                                              Sort Key: ((SubPlan 2)), cp.created_at DESC
                                              Sort Method: quicksort  Memory: 26kB
                                              Buffers: shared hit=7158
                                              ->  Index Scan using customer_products_internal_customer_id_idx on customer_products cp  (cost=0.56..9.04 rows=2 width=551) (actual time=0.021..0.023 rows=1.03 loops=693)
                                                    Index Cond: (internal_customer_id = cr_2.internal_id)
                                                    Filter: (status = ANY ('{active,past_due,scheduled}'::text[]))
                                                    Rows Removed by Filter: 1
                                                    Index Searches: 693
                                                    Buffers: shared hit=7158
                                                    SubPlan 2
                                                      ->  Index Scan using plans_pkey on products p  (cost=0.41..2.13 rows=1 width=1) (actual time=0.009..0.009 rows=1.00 loops=717)
                                                            Index Cond: (internal_id = cp.internal_product_id)
                                                            Index Searches: 717
                                                            Buffers: shared hit=2868
                            ->  Memoize  (cost=0.42..2.14 rows=1 width=282) (actual time=0.001..0.001 rows=1.00 loops=717)
                                  Cache Key: cp.internal_product_id
                                  Cache Mode: logical
                                  Hits: 703  Misses: 14  Evictions: 0  Overflows: 0  Memory Usage: 6kB
                                  Buffers: shared hit=56
                                  ->  Index Scan using plans_pkey on products prod  (cost=0.41..2.13 rows=1 width=282) (actual time=0.026..0.026 rows=1.00 loops=14)
                                        Index Cond: (internal_id = cp.internal_product_id)
                                        Index Searches: 14
                                        Buffers: shared hit=56
                      ->  Memoize  (cost=6.81..6.82 rows=1 width=32) (actual time=0.067..0.068 rows=1.00 loops=717)
                            Cache Key: cp.id
                            Cache Mode: binary
                            Hits: 0  Misses: 717  Evictions: 0  Overflows: 0  Memory Usage: 620kB
                            Buffers: shared hit=5666
                            ->  Aggregate  (cost=6.80..6.81 rows=1 width=32) (actual time=0.066..0.066 rows=1.00 loops=717)
                                  Buffers: shared hit=5666
                                  ->  Nested Loop Left Join  (cost=0.84..6.78 rows=2 width=871) (actual time=0.032..0.032 rows=0.98 loops=717)
                                        Buffers: shared hit=5666
                                        ->  Index Scan using idx_customer_prices_product_id on customer_prices cpr  (cost=0.42..2.51 rows=2 width=269) (actual time=0.027..0.028 rows=0.98 loops=717)
                                              Index Cond: (customer_product_id = cp.id)
                                              Index Searches: 717
                                              Buffers: shared hit=2854
                                        ->  Index Scan using prices_pkey on prices p_1  (cost=0.42..2.13 rows=1 width=664) (actual time=0.004..0.004 rows=1.00 loops=703)
                                              Index Cond: (id = cpr.price_id)
                                              Index Searches: 703
                                              Buffers: shared hit=2812
                ->  Memoize  (cost=999.93..999.94 rows=1 width=32) (actual time=0.238..0.238 rows=1.00 loops=717)
                      Cache Key: cp.id
                      Cache Mode: binary
                      Hits: 0  Misses: 717  Evictions: 0  Overflows: 0  Memory Usage: 2664kB
                      Buffers: shared hit=23376
                      ->  Aggregate  (cost=999.92..999.93 rows=1 width=32) (actual time=0.235..0.235 rows=1.00 loops=717)
                            Buffers: shared hit=23376
                            ->  Index Scan using idx_customer_entitlements_product_id on customer_entitlements ce_2  (cost=0.56..78.98 rows=106 width=537) (actual time=0.024..0.035 rows=2.04 loops=717)
                                  Index Cond: (customer_product_id = cp.id)
                                  Index Searches: 717
                                  Buffers: shared hit=4318
                            SubPlan 3
                              ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.022..0.022 rows=1.00 loops=1466)
                                    Buffers: shared hit=11728
                                    ->  Index Scan using entitlements_pkey on entitlements e  (cost=0.43..2.15 rows=1 width=359) (actual time=0.004..0.004 rows=1.00 loops=1466)
                                          Index Cond: (id = ce_2.entitlement_id)
                                          Index Searches: 1466
                                          Buffers: shared hit=5864
                                    ->  Index Scan using features_pkey on features f  (cost=0.41..2.13 rows=1 width=349) (actual time=0.006..0.006 rows=1.00 loops=1466)
                                          Index Cond: (internal_id = (e.internal_feature_id)::text)
                                          Index Searches: 1466
                                          Buffers: shared hit=5864
                            SubPlan 4
                              ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1466)
                                    Buffers: shared hit=1466
                                    ->  Seq Scan on replaceables r  (cost=0.00..1.12 rows=2 width=154) (actual time=0.005..0.005 rows=0.00 loops=1466)
                                          Filter: (cus_ent_id = ce_2.id)
                                          Rows Removed by Filter: 21
                                          Buffers: shared hit=1466
                            SubPlan 5
                              ->  Aggregate  (cost=3.24..3.25 rows=1 width=32) (actual time=0.014..0.014 rows=1.00 loops=1466)
                                    Buffers: shared hit=5864
                                    ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro  (cost=0.56..3.17 rows=4 width=125) (actual time=0.011..0.011 rows=0.00 loops=1466)
                                          Index Cond: (cus_ent_id = ce_2.id)
                                          Index Searches: 1466
                                          Buffers: shared hit=5864
          ->  Memoize  (cost=0.30..2.01 rows=1 width=139) (actual time=0.000..0.000 rows=0.00 loops=717)
                Cache Key: cp.free_trial_id
                Cache Mode: logical
                Hits: 716  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                ->  Index Scan using free_trials_pkey on free_trials ft  (cost=0.29..2.00 rows=1 width=139) (actual time=0.002..0.002 rows=0.00 loops=1)
                      Index Cond: (id = cp.free_trial_id)
                      Index Searches: 0
  ->  Hash Right Join  (cost=7588.29..59835.44 rows=1001 width=609) (actual time=2202.997..2204.248 rows=693.00 loops=1)
        Hash Cond: (cr_1.internal_id = cr.internal_id)
        Buffers: shared hit=49650
        ->  GroupAggregate  (cost=7113.76..59337.13 rows=1001 width=64) (actual time=3.305..4.089 rows=693.00 loops=1)
              Group Key: cr_1.internal_id
              Buffers: shared hit=2079
              ->  Sort  (cost=7113.76..7128.78 rows=6006 width=569) (actual time=3.295..3.370 rows=693.00 loops=1)
                    Sort Key: cr_1.internal_id COLLATE "C"
                    Sort Method: quicksort  Memory: 57kB
                    Buffers: shared hit=2079
                    ->  Nested Loop Left Join  (cost=6.58..6736.82 rows=6006 width=569) (actual time=0.021..2.976 rows=693.00 loops=1)
                          Buffers: shared hit=2079
                          ->  CTE Scan on customer_records cr_1  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.000..0.128 rows=693.00 loops=1)
                                Storage: Memory  Maximum Storage: 192kB
                          ->  Subquery Scan on ce  (cost=6.58..6.65 rows=6 width=537) (actual time=0.004..0.004 rows=0.00 loops=693)
                                Buffers: shared hit=2079
                                ->  Limit  (cost=6.58..6.59 rows=6 width=445) (actual time=0.004..0.004 rows=0.00 loops=693)
                                      Buffers: shared hit=2079
                                      ->  Sort  (cost=6.58..6.59 rows=6 width=445) (actual time=0.003..0.003 rows=0.00 loops=693)
                                            Sort Key: ce_1.id DESC
                                            Sort Method: quicksort  Memory: 25kB
                                            Buffers: shared hit=2079
                                            ->  Index Scan using idx_customer_entitlements_loose_customer_expires on customer_entitlements ce_1  (cost=0.43..6.50 rows=6 width=445) (actual time=0.003..0.003 rows=0.00 loops=693)
                                                  Index Cond: (internal_customer_id = cr_1.internal_id)
                                                  Filter: ((expires_at IS NULL) OR (expires_at > (EXTRACT(epoch FROM now()) * '1000'::numeric)))
                                                  Index Searches: 693
                                                  Buffers: shared hit=2079
              SubPlan 7
                ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (never executed)
                      ->  Index Scan using entitlements_pkey on entitlements e_1  (cost=0.43..2.15 rows=1 width=359) (never executed)
                            Index Cond: (id = ce.entitlement_id)
                            Index Searches: 0
                      ->  Index Scan using features_pkey on features f_1  (cost=0.41..2.13 rows=1 width=349) (never executed)
                            Index Cond: (internal_id = (e_1.internal_feature_id)::text)
                            Index Searches: 0
              SubPlan 8
                ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (never executed)
                      ->  Seq Scan on replaceables r_1  (cost=0.00..1.12 rows=2 width=154) (never executed)
                            Filter: (cus_ent_id = ce.id)
              SubPlan 9
                ->  Aggregate  (cost=3.24..3.25 rows=1 width=32) (never executed)
                      ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro_1  (cost=0.56..3.17 rows=4 width=125) (never executed)
                            Index Cond: (cus_ent_id = ce.id)
                            Index Searches: 0
        ->  Hash  (cost=462.02..462.02 rows=1001 width=577) (actual time=2199.659..2199.670 rows=693.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 4181kB
              Buffers: shared hit=47571
              ->  Hash Left Join  (cost=436.72..462.02 rows=1001 width=577) (actual time=2198.002..2198.662 rows=693.00 loops=1)
                    Hash Cond: (cr.internal_id = cs.internal_customer_id)
                    Buffers: shared hit=47571
                    ->  Hash Left Join  (cost=183.56..206.22 rows=1001 width=545) (actual time=2196.834..2197.301 rows=693.00 loops=1)
                          Hash Cond: (cr.internal_id = cpa.internal_customer_id)
                          Buffers: shared hit=47543
                          ->  CTE Scan on customer_records cr  (cost=0.00..20.02 rows=1001 width=513) (actual time=56.380..56.454 rows=693.00 loops=1)
                                Storage: Memory  Maximum Storage: 192kB
                                Buffers: shared hit=32
                          ->  Hash  (cost=178.66..178.66 rows=392 width=64) (actual time=2140.446..2140.449 rows=668.00 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 4040kB
                                Buffers: shared hit=47511
                                ->  Subquery Scan on cpa  (cost=149.82..178.66 rows=392 width=64) (actual time=2134.030..2140.018 rows=668.00 loops=1)
                                      Buffers: shared hit=47511
                                      ->  GroupAggregate  (cost=149.82..174.74 rows=392 width=64) (actual time=2134.028..2139.898 rows=668.00 loops=1)
                                            Group Key: cpwp.internal_customer_id
                                            Buffers: shared hit=47511
                                            ->  Sort  (cost=149.82..154.83 rows=2002 width=152) (actual time=2133.990..2134.133 rows=717.00 loops=1)
                                                  Sort Key: cpwp.internal_customer_id COLLATE "C", cpwp.created_at DESC
                                                  Sort Method: quicksort  Memory: 3669kB
                                                  Buffers: shared hit=47511
                                                  ->  CTE Scan on customer_products_with_prices cpwp  (cost=0.00..40.04 rows=2002 width=152) (actual time=0.729..2132.964 rows=717.00 loops=1)
                                                        Storage: Memory  Maximum Storage: 3621kB
                                                        Buffers: shared hit=47511
                    ->  Hash  (cost=250.66..250.66 rows=200 width=64) (actual time=1.163..1.170 rows=7.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 11kB
                          Buffers: shared hit=28
                          ->  Subquery Scan on cs  (cost=246.16..250.66 rows=200 width=64) (actual time=1.155..1.165 rows=7.00 loops=1)
                                Buffers: shared hit=28
                                ->  HashAggregate  (cost=246.16..248.66 rows=200 width=64) (actual time=1.154..1.162 rows=7.00 loops=1)
                                      Group Key: s.internal_customer_id
                                      Batches: 1  Memory Usage: 40kB
                                      Buffers: shared hit=28
                                      ->  Subquery Scan on s  (cost=190.28..230.92 rows=2032 width=298) (actual time=1.092..1.120 rows=7.00 loops=1)
                                            Buffers: shared hit=28
                                            ->  HashAggregate  (cost=190.28..210.60 rows=2032 width=213) (actual time=1.085..1.108 rows=7.00 loops=1)
                                                  Group Key: cpwp_1.internal_customer_id, s_1.id, s_1.stripe_id, s_1.stripe_schedule_id, s_1.created_at, s_1.usage_features, s_1.metadata, s_1.org_id, s_1.env, s_1.current_period_start, s_1.current_period_end
                                                  Batches: 1  Memory Usage: 105kB
                                                  Buffers: shared hit=28
                                                  ->  Nested Loop  (cost=0.43..134.40 rows=2032 width=213) (actual time=0.170..1.066 rows=7.00 loops=1)
                                                        Buffers: shared hit=28
                                                        ->  Nested Loop  (cost=0.00..80.08 rows=2002 width=64) (actual time=0.144..0.955 rows=7.00 loops=1)
                                                              ->  CTE Scan on customer_products_with_prices cpwp_1  (cost=0.00..40.04 rows=2002 width=64) (actual time=0.001..0.404 rows=717.00 loops=1)
                                                                    Storage: Memory  Maximum Storage: 3621kB
                                                              ->  Function Scan on unnest cpwp_sub  (cost=0.00..0.01 rows=1 width=32) (actual time=0.000..0.000 rows=0.01 loops=717)
                                                        ->  Memoize  (cost=0.43..2.15 rows=1 width=181) (actual time=0.014..0.015 rows=1.00 loops=7)
                                                              Cache Key: cpwp_sub.stripe_id
                                                              Cache Mode: logical
                                                              Hits: 0  Misses: 7  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                                              Buffers: shared hit=28
                                                              ->  Index Scan using idx_subscriptions_stripe_id on subscriptions s_1  (cost=0.42..2.14 rows=1 width=181) (actual time=0.012..0.013 rows=1.00 loops=7)
                                                                    Index Cond: (stripe_id = cpwp_sub.stripe_id)
                                                                    Index Searches: 7
                                                                    Buffers: shared hit=28
Planning:
  Buffers: shared hit=60
Planning Time: 2.677 ms
Execution Time: 2321.477 ms
```
