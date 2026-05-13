# Pagination Benchmark — 2026-05-13 — prod / firecrawl

## Config

- org_id: `biu9vSF7vghBLSKW1UTDwxHBAivjnPaK`
- env: `live`
- total_customers: `1,224,181`
- deep_offset (45% of total): `550,881`
- deep_cursor: `{ t: 1774237983362, id: b2f40a0e-3e60-4e12-bef5-eba5151ecc2e }`
- search_term: `@gmail`
- limit: `1000`
- repeats per cell: 5
- statement_timeout_ms: 30000
- read_only: true
- uses full CTE pipeline: yes (getPaginatedFullCusQuery + getCursorPaginatedFullCusQuery)

## Results

| # | Cell | Rows | median ms | p95 ms | min ms | max ms | Error |
|---|------|------|-----------|--------|--------|--------|-------|
| 01 | offset / no filter / page 0 / limit 1000 | 1000 | 2560.47 | 2837.41 | 1945.89 | 2837.41 |  |
| 02 | count / unfiltered total | 1 | 1142.40 | 1223.20 | 1107.59 | 1223.20 |  |
| 03 | offset / no filter / deep (offset 550881) / limit 1000 | 1000 | 3284.88 | 3919.19 | 3145.20 | 3919.19 |  |
| 04 | offset / search "@gmail" / deep (offset 550881) / limit 1000 | 0 | 3954.36 | 6430.40 | 3553.60 | 6430.40 |  |
| 05 | count / filtered search "@gmail" | 1 | 1324.53 | 1446.98 | 1278.48 | 1446.98 |  |
| 07 | cursor / no filter / first page / limit 1000 | 1001 | 2617.11 | 2661.25 | 2287.09 | 2661.25 |  |
| 08 | cursor / no filter / deep (via constructed cursor) / limit 1000 | 1001 | 2479.69 | 2809.58 | 2330.19 | 2809.58 |  |
| 09 | cursor / search "@gmail" / deep / limit 1000 | 1001 | 4373.84 | 5839.03 | 3579.55 | 5839.03 |  |

## EXPLAIN ANALYZE

### 01 offset / no filter / page 0 / limit 1000

```
Sort  (cost=72750.66..72753.16 rows=1000 width=609) (actual time=189.758..189.911 rows=1000.00 loops=1)
  Sort Key: cr.created_at DESC
  Sort Method: quicksort  Memory: 6621kB
  Buffers: shared hit=59400
  CTE customer_records
    ->  Limit  (cost=0.56..215.53 rows=1000 width=573) (actual time=0.026..0.904 rows=1000.00 loops=1)
          Buffers: shared hit=769
          ->  Index Scan using idx_customers_org_id_env_created_at on customers c  (cost=0.56..260520.12 rows=1211881 width=573) (actual time=0.025..0.809 rows=1000.00 loops=1)
                Index Cond: ((org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'::text) AND (env = 'live'::text))
                Index Searches: 1
                Buffers: shared hit=769
  CTE customer_products_with_prices
    ->  Nested Loop Left Join  (cost=1022.42..12375.95 rows=2000 width=678) (actual time=0.252..127.318 rows=1000.00 loops=1)
          Buffers: shared hit=44645
          ->  Nested Loop Left Join  (cost=1022.12..12309.95 rows=2000 width=864) (actual time=0.245..123.818 rows=1000.00 loops=1)
                Buffers: shared hit=44645
                ->  Nested Loop Left Join  (cost=16.29..9243.47 rows=2000 width=832) (actual time=0.060..19.217 rows=1000.00 loops=1)
                      Buffers: shared hit=12861
                      ->  Nested Loop  (cost=9.48..9173.04 rows=2000 width=800) (actual time=0.042..11.338 rows=1000.00 loops=1)
                            Buffers: shared hit=9789
                            ->  Nested Loop  (cost=9.05..9116.65 rows=2000 width=550) (actual time=0.031..10.710 rows=1000.00 loops=1)
                                  Buffers: shared hit=9769
                                  ->  CTE Scan on customer_records cr_2  (cost=0.00..20.00 rows=1000 width=32) (actual time=0.000..1.271 rows=1000.00 loops=1)
                                        Storage: Memory  Maximum Storage: 810kB
                                        Buffers: shared hit=764
                                  ->  Limit  (cost=9.05..9.06 rows=2 width=551) (actual time=0.009..0.009 rows=1.00 loops=1000)
                                        Buffers: shared hit=9005
                                        ->  Sort  (cost=9.05..9.06 rows=2 width=551) (actual time=0.008..0.009 rows=1.00 loops=1000)
                                              Sort Key: ((SubPlan 2)), cp.created_at DESC
                                              Sort Method: quicksort  Memory: 25kB
                                              Buffers: shared hit=9005
                                              ->  Index Scan using customer_products_internal_customer_id_idx on customer_products cp  (cost=0.56..9.04 rows=2 width=551) (actual time=0.007..0.007 rows=1.00 loops=1000)
                                                    Index Cond: (internal_customer_id = cr_2.internal_id)
                                                    Filter: (status = ANY ('{active,past_due,scheduled}'::text[]))
                                                    Rows Removed by Filter: 0
                                                    Index Searches: 1000
                                                    Buffers: shared hit=9005
                                                    SubPlan 2
                                                      ->  Index Scan using plans_pkey on products p  (cost=0.41..2.13 rows=1 width=1) (actual time=0.004..0.004 rows=1.00 loops=1000)
                                                            Index Cond: (internal_id = cp.internal_product_id)
                                                            Index Searches: 1000
                                                            Buffers: shared hit=4000
                            ->  Memoize  (cost=0.42..2.14 rows=1 width=282) (actual time=0.000..0.000 rows=1.00 loops=1000)
                                  Cache Key: cp.internal_product_id
                                  Cache Mode: logical
                                  Hits: 995  Misses: 5  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                  Buffers: shared hit=20
                                  ->  Index Scan using plans_pkey on products prod  (cost=0.41..2.13 rows=1 width=282) (actual time=0.006..0.006 rows=1.00 loops=5)
                                        Index Cond: (internal_id = cp.internal_product_id)
                                        Index Searches: 5
                                        Buffers: shared hit=20
                      ->  Memoize  (cost=6.81..6.82 rows=1 width=32) (actual time=0.007..0.007 rows=1.00 loops=1000)
                            Cache Key: cp.id
                            Cache Mode: binary
                            Hits: 0  Misses: 1000  Evictions: 0  Overflows: 0  Memory Usage: 148kB
                            Buffers: shared hit=3072
                            ->  Aggregate  (cost=6.80..6.81 rows=1 width=32) (actual time=0.007..0.007 rows=1.00 loops=1000)
                                  Buffers: shared hit=3072
                                  ->  Nested Loop Left Join  (cost=0.84..6.78 rows=2 width=871) (actual time=0.006..0.006 rows=0.02 loops=1000)
                                        Buffers: shared hit=3072
                                        ->  Index Scan using idx_customer_prices_product_id on customer_prices cpr  (cost=0.42..2.51 rows=2 width=269) (actual time=0.006..0.006 rows=0.02 loops=1000)
                                              Index Cond: (customer_product_id = cp.id)
                                              Index Searches: 1000
                                              Buffers: shared hit=3008
                                        ->  Index Scan using prices_pkey on prices p_1  (cost=0.42..2.13 rows=1 width=664) (actual time=0.005..0.005 rows=1.00 loops=16)
                                              Index Cond: (id = cpr.price_id)
                                              Index Searches: 16
                                              Buffers: shared hit=64
                ->  Memoize  (cost=1005.83..1005.84 rows=1 width=32) (actual time=0.104..0.104 rows=1.00 loops=1000)
                      Cache Key: cp.id
                      Cache Mode: binary
                      Hits: 0  Misses: 1000  Evictions: 0  Overflows: 0  Memory Usage: 3374kB
                      Buffers: shared hit=31784
                      ->  Aggregate  (cost=1005.82..1005.83 rows=1 width=32) (actual time=0.103..0.103 rows=1.00 loops=1000)
                            Buffers: shared hit=31784
                            ->  Index Scan using idx_customer_entitlements_product_id on customer_entitlements ce_2  (cost=0.56..78.98 rows=106 width=537) (actual time=0.009..0.011 rows=2.01 loops=1000)
                                  Index Cond: (customer_product_id = cp.id)
                                  Index Searches: 1000
                                  Buffers: shared hit=5680
                            SubPlan 3
                              ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.009..0.010 rows=1.00 loops=2008)
                                    Buffers: shared hit=16064
                                    ->  Index Scan using entitlements_pkey on entitlements e  (cost=0.43..2.15 rows=1 width=359) (actual time=0.002..0.002 rows=1.00 loops=2008)
                                          Index Cond: (id = ce_2.entitlement_id)
                                          Index Searches: 2008
                                          Buffers: shared hit=8032
                                    ->  Index Scan using features_pkey on features f  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=2008)
                                          Index Cond: (internal_id = (e.internal_feature_id)::text)
                                          Index Searches: 2008
                                          Buffers: shared hit=8032
                            SubPlan 4
                              ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=2008)
                                    Buffers: shared hit=2008
                                    ->  Seq Scan on replaceables r  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=2008)
                                          Filter: (cus_ent_id = ce_2.id)
                                          Rows Removed by Filter: 21
                                          Buffers: shared hit=2008
                            SubPlan 5
                              ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=2008)
                                    Buffers: shared hit=8032
                                    ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro  (cost=0.56..3.23 rows=4 width=125) (actual time=0.005..0.005 rows=0.00 loops=2008)
                                          Index Cond: (cus_ent_id = ce_2.id)
                                          Index Searches: 2008
                                          Buffers: shared hit=8032
          ->  Memoize  (cost=0.30..2.01 rows=1 width=139) (actual time=0.000..0.000 rows=0.00 loops=1000)
                Cache Key: cp.free_trial_id
                Cache Mode: logical
                Hits: 999  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                ->  Index Scan using free_trials_pkey on free_trials ft  (cost=0.29..2.00 rows=1 width=139) (actual time=0.001..0.001 rows=0.00 loops=1)
                      Index Cond: (id = cp.free_trial_id)
                      Index Searches: 0
  ->  Hash Right Join  (cost=7580.65..60109.35 rows=1000 width=609) (actual time=147.867..186.544 rows=1000.00 loops=1)
        Hash Cond: (cr_1.internal_id = cr.internal_id)
        Buffers: shared hit=59400
        ->  GroupAggregate  (cost=7106.61..59611.57 rows=1000 width=64) (actual time=5.381..43.338 rows=1000.00 loops=1)
              Group Key: cr_1.internal_id
              Buffers: shared hit=14718
              ->  Sort  (cost=7106.61..7121.61 rows=6000 width=569) (actual time=5.258..5.368 rows=1007.00 loops=1)
                    Sort Key: cr_1.internal_id COLLATE "C"
                    Sort Method: quicksort  Memory: 381kB
                    Buffers: shared hit=3837
                    ->  Nested Loop Left Join  (cost=6.58..6730.09 rows=6000 width=569) (actual time=0.037..4.795 rows=1007.00 loops=1)
                          Buffers: shared hit=3837
                          ->  CTE Scan on customer_records cr_1  (cost=0.00..20.00 rows=1000 width=32) (actual time=0.001..0.187 rows=1000.00 loops=1)
                                Storage: Memory  Maximum Storage: 810kB
                          ->  Subquery Scan on ce  (cost=6.58..6.65 rows=6 width=537) (actual time=0.004..0.004 rows=0.84 loops=1000)
                                Buffers: shared hit=3837
                                ->  Limit  (cost=6.58..6.59 rows=6 width=445) (actual time=0.004..0.004 rows=0.84 loops=1000)
                                      Buffers: shared hit=3837
                                      ->  Sort  (cost=6.58..6.59 rows=6 width=445) (actual time=0.003..0.003 rows=0.84 loops=1000)
                                            Sort Key: ce_1.id DESC
                                            Sort Method: quicksort  Memory: 25kB
                                            Buffers: shared hit=3837
                                            ->  Index Scan using idx_customer_entitlements_loose_customer_expires on customer_entitlements ce_1  (cost=0.43..6.50 rows=6 width=445) (actual time=0.003..0.003 rows=0.84 loops=1000)
                                                  Index Cond: (internal_customer_id = cr_1.internal_id)
                                                  Filter: ((expires_at IS NULL) OR (expires_at > (EXTRACT(epoch FROM now()) * '1000'::numeric)))
                                                  Index Searches: 1000
                                                  Buffers: shared hit=3837
              SubPlan 7
                ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.009..0.009 rows=1.00 loops=837)
                      Buffers: shared hit=6696
                      ->  Index Scan using entitlements_pkey on entitlements e_1  (cost=0.43..2.15 rows=1 width=359) (actual time=0.002..0.002 rows=1.00 loops=837)
                            Index Cond: (id = ce.entitlement_id)
                            Index Searches: 837
                            Buffers: shared hit=3348
                      ->  Index Scan using features_pkey on features f_1  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=837)
                            Index Cond: (internal_id = (e_1.internal_feature_id)::text)
                            Index Searches: 837
                            Buffers: shared hit=3348
              SubPlan 8
                ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=837)
                      Buffers: shared hit=837
                      ->  Seq Scan on replaceables r_1  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=837)
                            Filter: (cus_ent_id = ce.id)
                            Rows Removed by Filter: 21
                            Buffers: shared hit=837
              SubPlan 9
                ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=837)
                      Buffers: shared hit=3348
                      ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro_1  (cost=0.56..3.23 rows=4 width=125) (actual time=0.005..0.005 rows=0.00 loops=837)
                            Index Cond: (cus_ent_id = ce.id)
                            Index Searches: 837
                            Buffers: shared hit=3348
        ->  Hash  (cost=461.54..461.54 rows=1000 width=577) (actual time=142.479..142.487 rows=1000.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 5279kB
              Buffers: shared hit=44682
              ->  Hash Left Join  (cost=436.26..461.54 rows=1000 width=577) (actual time=140.388..141.313 rows=1000.00 loops=1)
                    Hash Cond: (cr.internal_id = cs.internal_customer_id)
                    Buffers: shared hit=44682
                    ->  Hash Left Join  (cost=183.34..205.98 rows=1000 width=545) (actual time=138.906..139.595 rows=1000.00 loops=1)
                          Hash Cond: (cr.internal_id = cpa.internal_customer_id)
                          Buffers: shared hit=44650
                          ->  CTE Scan on customer_records cr  (cost=0.00..20.00 rows=1000 width=513) (actual time=0.027..0.179 rows=1000.00 loops=1)
                                Storage: Memory  Maximum Storage: 810kB
                                Buffers: shared hit=5
                          ->  Hash  (cost=178.46..178.46 rows=391 width=64) (actual time=138.875..138.877 rows=1000.00 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 4540kB
                                Buffers: shared hit=44645
                                ->  Subquery Scan on cpa  (cost=149.66..178.46 rows=391 width=64) (actual time=130.544..138.312 rows=1000.00 loops=1)
                                      Buffers: shared hit=44645
                                      ->  GroupAggregate  (cost=149.66..174.55 rows=391 width=64) (actual time=130.543..138.148 rows=1000.00 loops=1)
                                            Group Key: cpwp.internal_customer_id
                                            Buffers: shared hit=44645
                                            ->  Sort  (cost=149.66..154.66 rows=2000 width=152) (actual time=130.526..130.692 rows=1000.00 loops=1)
                                                  Sort Key: cpwp.internal_customer_id COLLATE "C", cpwp.created_at DESC
                                                  Sort Method: quicksort  Memory: 3999kB
                                                  Buffers: shared hit=44645
                                                  ->  CTE Scan on customer_products_with_prices cpwp  (cost=0.00..40.00 rows=2000 width=152) (actual time=0.259..129.582 rows=1000.00 loops=1)
                                                        Storage: Memory  Maximum Storage: 3936kB
                                                        Buffers: shared hit=44645
                    ->  Hash  (cost=250.42..250.42 rows=200 width=64) (actual time=1.478..1.482 rows=8.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 12kB
                          Buffers: shared hit=32
                          ->  Subquery Scan on cs  (cost=245.92..250.42 rows=200 width=64) (actual time=1.450..1.459 rows=8.00 loops=1)
                                Buffers: shared hit=32
                                ->  HashAggregate  (cost=245.92..248.42 rows=200 width=64) (actual time=1.449..1.456 rows=8.00 loops=1)
                                      Group Key: s.internal_customer_id
                                      Batches: 1  Memory Usage: 40kB
                                      Buffers: shared hit=32
                                      ->  Subquery Scan on s  (cost=190.10..230.70 rows=2030 width=298) (actual time=1.389..1.411 rows=8.00 loops=1)
                                            Buffers: shared hit=32
                                            ->  HashAggregate  (cost=190.10..210.40 rows=2030 width=213) (actual time=1.383..1.399 rows=8.00 loops=1)
                                                  Group Key: cpwp_1.internal_customer_id, s_1.id, s_1.stripe_id, s_1.stripe_schedule_id, s_1.created_at, s_1.usage_features, s_1.metadata, s_1.org_id, s_1.env, s_1.current_period_start, s_1.current_period_end
                                                  Batches: 1  Memory Usage: 105kB
                                                  Buffers: shared hit=32
                                                  ->  Nested Loop  (cost=0.43..134.27 rows=2030 width=213) (actual time=0.628..1.363 rows=8.00 loops=1)
                                                        Buffers: shared hit=32
                                                        ->  Nested Loop  (cost=0.00..80.00 rows=2000 width=64) (actual time=0.598..1.279 rows=8.00 loops=1)
                                                              ->  CTE Scan on customer_products_with_prices cpwp_1  (cost=0.00..40.00 rows=2000 width=64) (actual time=0.001..0.503 rows=1000.00 loops=1)
                                                                    Storage: Memory  Maximum Storage: 3936kB
                                                              ->  Function Scan on unnest cpwp_sub  (cost=0.00..0.01 rows=1 width=32) (actual time=0.000..0.000 rows=0.01 loops=1000)
                                                        ->  Memoize  (cost=0.43..2.15 rows=1 width=181) (actual time=0.009..0.010 rows=1.00 loops=8)
                                                              Cache Key: cpwp_sub.stripe_id
                                                              Cache Mode: logical
                                                              Hits: 0  Misses: 8  Evictions: 0  Overflows: 0  Memory Usage: 3kB
                                                              Buffers: shared hit=32
                                                              ->  Index Scan using idx_subscriptions_stripe_id on subscriptions s_1  (cost=0.42..2.14 rows=1 width=181) (actual time=0.008..0.008 rows=1.00 loops=8)
                                                                    Index Cond: (stripe_id = cpwp_sub.stripe_id)
                                                                    Index Searches: 8
                                                                    Buffers: shared hit=32
Planning:
  Buffers: shared hit=39
Planning Time: 1.536 ms
Execution Time: 190.264 ms
```

### 02 count / unfiltered total

```
Finalize Aggregate  (cost=193846.81..193846.82 rows=1 width=4) (actual time=525.876..627.078 rows=1.00 loops=1)
  Buffers: shared hit=1561470
  ->  Gather  (cost=193846.39..193846.80 rows=4 width=8) (actual time=525.571..627.064 rows=5.00 loops=1)
        Workers Planned: 4
        Workers Launched: 4
        Buffers: shared hit=1561470
        ->  Partial Aggregate  (cost=192846.39..192846.40 rows=1 width=8) (actual time=520.504..520.505 rows=1.00 loops=5)
              Buffers: shared hit=1561438
              ->  Parallel Index Only Scan using idx_customers_org_id_env_created_at on customers c  (cost=0.56..192088.96 rows=302970 width=0) (actual time=0.052..503.643 rows=244836.60 loops=5)
                    Index Cond: ((org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'::text) AND (env = 'live'::text))
                    Heap Fetches: 1115470
                    Index Searches: 1
                    Buffers: shared hit=1561438
Planning Time: 0.093 ms
Execution Time: 627.141 ms
```

### 03 offset / no filter / deep (offset 550881) / limit 1000

```
Sort  (cost=191174.23..191176.73 rows=1000 width=609) (actual time=781.420..781.490 rows=1000.00 loops=1)
  Sort Key: cr.created_at DESC
  Sort Method: quicksort  Memory: 7189kB
  Buffers: shared hit=604373 read=1
  CTE customer_records
    ->  Limit  (cost=118424.13..118639.10 rows=1000 width=573) (actual time=571.517..572.980 rows=1000.00 loops=1)
          Buffers: shared hit=540822
          ->  Index Scan using idx_customers_org_id_env_created_at on customers c  (cost=0.56..260520.12 rows=1211881 width=573) (actual time=0.024..550.985 rows=551881.00 loops=1)
                Index Cond: ((org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'::text) AND (env = 'live'::text))
                Index Searches: 1
                Buffers: shared hit=540822
  CTE customer_products_with_prices
    ->  Nested Loop Left Join  (cost=1022.42..12375.95 rows=2000 width=678) (actual time=0.335..127.721 rows=1000.00 loops=1)
          Buffers: shared hit=45084 read=1
          ->  Nested Loop Left Join  (cost=1022.12..12309.95 rows=2000 width=864) (actual time=0.326..124.190 rows=1000.00 loops=1)
                Buffers: shared hit=45084 read=1
                ->  Nested Loop Left Join  (cost=16.29..9243.47 rows=2000 width=832) (actual time=0.123..20.398 rows=1000.00 loops=1)
                      Buffers: shared hit=14014 read=1
                      ->  Nested Loop  (cost=9.48..9173.04 rows=2000 width=800) (actual time=0.101..13.561 rows=1000.00 loops=1)
                            Buffers: shared hit=11005 read=1
                            ->  Nested Loop  (cost=9.05..9116.65 rows=2000 width=550) (actual time=0.077..12.945 rows=1000.00 loops=1)
                                  Buffers: shared hit=10997 read=1
                                  ->  CTE Scan on customer_records cr_2  (cost=0.00..20.00 rows=1000 width=32) (actual time=0.001..2.092 rows=1000.00 loops=1)
                                        Storage: Memory  Maximum Storage: 839kB
                                        Buffers: shared hit=992
                                  ->  Limit  (cost=9.05..9.06 rows=2 width=551) (actual time=0.010..0.010 rows=1.00 loops=1000)
                                        Buffers: shared hit=10005 read=1
                                        ->  Sort  (cost=9.05..9.06 rows=2 width=551) (actual time=0.010..0.010 rows=1.00 loops=1000)
                                              Sort Key: ((SubPlan 2)), cp.created_at DESC
                                              Sort Method: quicksort  Memory: 25kB
                                              Buffers: shared hit=10005 read=1
                                              ->  Index Scan using customer_products_internal_customer_id_idx on customer_products cp  (cost=0.56..9.04 rows=2 width=551) (actual time=0.008..0.008 rows=1.00 loops=1000)
                                                    Index Cond: (internal_customer_id = cr_2.internal_id)
                                                    Filter: (status = ANY ('{active,past_due,scheduled}'::text[]))
                                                    Rows Removed by Filter: 1
                                                    Index Searches: 1000
                                                    Buffers: shared hit=10005 read=1
                                                    SubPlan 2
                                                      ->  Index Scan using plans_pkey on products p  (cost=0.41..2.13 rows=1 width=1) (actual time=0.004..0.004 rows=1.00 loops=1000)
                                                            Index Cond: (internal_id = cp.internal_product_id)
                                                            Index Searches: 1000
                                                            Buffers: shared hit=4000
                            ->  Memoize  (cost=0.42..2.14 rows=1 width=282) (actual time=0.000..0.000 rows=1.00 loops=1000)
                                  Cache Key: cp.internal_product_id
                                  Cache Mode: logical
                                  Hits: 998  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                  Buffers: shared hit=8
                                  ->  Index Scan using plans_pkey on products prod  (cost=0.41..2.13 rows=1 width=282) (actual time=0.011..0.011 rows=1.00 loops=2)
                                        Index Cond: (internal_id = cp.internal_product_id)
                                        Index Searches: 2
                                        Buffers: shared hit=8
                      ->  Memoize  (cost=6.81..6.82 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1000)
                            Cache Key: cp.id
                            Cache Mode: binary
                            Hits: 0  Misses: 1000  Evictions: 0  Overflows: 0  Memory Usage: 135kB
                            Buffers: shared hit=3009
                            ->  Aggregate  (cost=6.80..6.81 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1000)
                                  Buffers: shared hit=3009
                                  ->  Nested Loop Left Join  (cost=0.84..6.78 rows=2 width=871) (actual time=0.005..0.005 rows=0.00 loops=1000)
                                        Buffers: shared hit=3009
                                        ->  Index Scan using idx_customer_prices_product_id on customer_prices cpr  (cost=0.42..2.51 rows=2 width=269) (actual time=0.005..0.005 rows=0.00 loops=1000)
                                              Index Cond: (customer_product_id = cp.id)
                                              Index Searches: 1000
                                              Buffers: shared hit=3001
                                        ->  Index Scan using prices_pkey on prices p_1  (cost=0.42..2.13 rows=1 width=664) (actual time=0.006..0.006 rows=1.00 loops=2)
                                              Index Cond: (id = cpr.price_id)
                                              Index Searches: 2
                                              Buffers: shared hit=8
                ->  Memoize  (cost=1005.83..1005.84 rows=1 width=32) (actual time=0.103..0.103 rows=1.00 loops=1000)
                      Cache Key: cp.id
                      Cache Mode: binary
                      Hits: 0  Misses: 1000  Evictions: 0  Overflows: 0  Memory Usage: 3363kB
                      Buffers: shared hit=31070
                      ->  Aggregate  (cost=1005.82..1005.83 rows=1 width=32) (actual time=0.102..0.102 rows=1.00 loops=1000)
                            Buffers: shared hit=31070
                            ->  Index Scan using idx_customer_entitlements_product_id on customer_entitlements ce_2  (cost=0.56..78.98 rows=106 width=537) (actual time=0.009..0.010 rows=2.00 loops=1000)
                                  Index Cond: (customer_product_id = cp.id)
                                  Index Searches: 1000
                                  Buffers: shared hit=5057
                            SubPlan 3
                              ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.009..0.010 rows=1.00 loops=2001)
                                    Buffers: shared hit=16008
                                    ->  Index Scan using entitlements_pkey on entitlements e  (cost=0.43..2.15 rows=1 width=359) (actual time=0.002..0.002 rows=1.00 loops=2001)
                                          Index Cond: (id = ce_2.entitlement_id)
                                          Index Searches: 2001
                                          Buffers: shared hit=8004
                                    ->  Index Scan using features_pkey on features f  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=2001)
                                          Index Cond: (internal_id = (e.internal_feature_id)::text)
                                          Index Searches: 2001
                                          Buffers: shared hit=8004
                            SubPlan 4
                              ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=2001)
                                    Buffers: shared hit=2001
                                    ->  Seq Scan on replaceables r  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=2001)
                                          Filter: (cus_ent_id = ce_2.id)
                                          Rows Removed by Filter: 21
                                          Buffers: shared hit=2001
                            SubPlan 5
                              ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=2001)
                                    Buffers: shared hit=8004
                                    ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro  (cost=0.56..3.23 rows=4 width=125) (actual time=0.005..0.005 rows=0.00 loops=2001)
                                          Index Cond: (cus_ent_id = ce_2.id)
                                          Index Searches: 2001
                                          Buffers: shared hit=8004
          ->  Memoize  (cost=0.30..2.01 rows=1 width=139) (actual time=0.000..0.000 rows=0.00 loops=1000)
                Cache Key: cp.free_trial_id
                Cache Mode: logical
                Hits: 999  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                ->  Index Scan using free_trials_pkey on free_trials ft  (cost=0.29..2.00 rows=1 width=139) (actual time=0.001..0.001 rows=0.00 loops=1)
                      Index Cond: (id = cp.free_trial_id)
                      Index Searches: 0
  ->  Hash Right Join  (cost=7580.65..60109.35 rows=1000 width=609) (actual time=723.503..777.027 rows=1000.00 loops=1)
        Hash Cond: (cr_1.internal_id = cr.internal_id)
        Buffers: shared hit=604373 read=1
        ->  GroupAggregate  (cost=7106.61..59611.57 rows=1000 width=64) (actual time=5.852..58.694 rows=1000.00 loops=1)
              Group Key: cr_1.internal_id
              Buffers: shared hit=19455
              ->  Sort  (cost=7106.61..7121.61 rows=6000 width=569) (actual time=5.677..5.831 rows=1461.00 loops=1)
                    Sort Key: cr_1.internal_id COLLATE "C"
                    Sort Method: quicksort  Memory: 579kB
                    Buffers: shared hit=4180
                    ->  Nested Loop Left Join  (cost=6.58..6730.09 rows=6000 width=569) (actual time=0.037..4.751 rows=1461.00 loops=1)
                          Buffers: shared hit=4180
                          ->  CTE Scan on customer_records cr_1  (cost=0.00..20.00 rows=1000 width=32) (actual time=0.000..0.167 rows=1000.00 loops=1)
                                Storage: Memory  Maximum Storage: 839kB
                          ->  Subquery Scan on ce  (cost=6.58..6.65 rows=6 width=537) (actual time=0.004..0.004 rows=1.18 loops=1000)
                                Buffers: shared hit=4180
                                ->  Limit  (cost=6.58..6.59 rows=6 width=445) (actual time=0.003..0.003 rows=1.18 loops=1000)
                                      Buffers: shared hit=4180
                                      ->  Sort  (cost=6.58..6.59 rows=6 width=445) (actual time=0.003..0.003 rows=1.18 loops=1000)
                                            Sort Key: ce_1.id DESC
                                            Sort Method: quicksort  Memory: 25kB
                                            Buffers: shared hit=4180
                                            ->  Index Scan using idx_customer_entitlements_loose_customer_expires on customer_entitlements ce_1  (cost=0.43..6.50 rows=6 width=445) (actual time=0.002..0.002 rows=1.18 loops=1000)
                                                  Index Cond: (internal_customer_id = cr_1.internal_id)
                                                  Filter: ((expires_at IS NULL) OR (expires_at > (EXTRACT(epoch FROM now()) * '1000'::numeric)))
                                                  Rows Removed by Filter: 0
                                                  Index Searches: 1000
                                                  Buffers: shared hit=4180
              SubPlan 7
                ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.010..0.010 rows=1.00 loops=1175)
                      Buffers: shared hit=9400
                      ->  Index Scan using entitlements_pkey on entitlements e_1  (cost=0.43..2.15 rows=1 width=359) (actual time=0.002..0.002 rows=1.00 loops=1175)
                            Index Cond: (id = ce.entitlement_id)
                            Index Searches: 1175
                            Buffers: shared hit=4700
                      ->  Index Scan using features_pkey on features f_1  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=1175)
                            Index Cond: (internal_id = (e_1.internal_feature_id)::text)
                            Index Searches: 1175
                            Buffers: shared hit=4700
              SubPlan 8
                ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=1175)
                      Buffers: shared hit=1175
                      ->  Seq Scan on replaceables r_1  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=1175)
                            Filter: (cus_ent_id = ce.id)
                            Rows Removed by Filter: 21
                            Buffers: shared hit=1175
              SubPlan 9
                ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1175)
                      Buffers: shared hit=4700
                      ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro_1  (cost=0.56..3.23 rows=4 width=125) (actual time=0.005..0.005 rows=0.00 loops=1175)
                            Index Cond: (cus_ent_id = ce.id)
                            Index Searches: 1175
                            Buffers: shared hit=4700
        ->  Hash  (cost=461.54..461.54 rows=1000 width=577) (actual time=717.645..717.652 rows=1000.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 5274kB
              Buffers: shared hit=584918 read=1
              ->  Hash Left Join  (cost=436.26..461.54 rows=1000 width=577) (actual time=713.725..714.524 rows=1000.00 loops=1)
                    Hash Cond: (cr.internal_id = cs.internal_customer_id)
                    Buffers: shared hit=584918 read=1
                    ->  Hash Left Join  (cost=183.34..205.98 rows=1000 width=545) (actual time=712.384..713.007 rows=1000.00 loops=1)
                          Hash Cond: (cr.internal_id = cpa.internal_customer_id)
                          Buffers: shared hit=584914 read=1
                          ->  CTE Scan on customer_records cr  (cost=0.00..20.00 rows=1000 width=513) (actual time=571.519..571.662 rows=1000.00 loops=1)
                                Storage: Memory  Maximum Storage: 839kB
                                Buffers: shared hit=539830
                          ->  Hash  (cost=178.46..178.46 rows=391 width=64) (actual time=140.857..140.859 rows=1000.00 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 4506kB
                                Buffers: shared hit=45084 read=1
                                ->  Subquery Scan on cpa  (cost=149.66..178.46 rows=391 width=64) (actual time=132.391..138.873 rows=1000.00 loops=1)
                                      Buffers: shared hit=45084 read=1
                                      ->  GroupAggregate  (cost=149.66..174.55 rows=391 width=64) (actual time=132.390..138.739 rows=1000.00 loops=1)
                                            Group Key: cpwp.internal_customer_id
                                            Buffers: shared hit=45084 read=1
                                            ->  Sort  (cost=149.66..154.66 rows=2000 width=152) (actual time=132.374..132.487 rows=1000.00 loops=1)
                                                  Sort Key: cpwp.internal_customer_id COLLATE "C", cpwp.created_at DESC
                                                  Sort Method: quicksort  Memory: 3966kB
                                                  Buffers: shared hit=45084 read=1
                                                  ->  CTE Scan on customer_products_with_prices cpwp  (cost=0.00..40.00 rows=2000 width=152) (actual time=0.347..130.693 rows=1000.00 loops=1)
                                                        Storage: Memory  Maximum Storage: 3903kB
                                                        Buffers: shared hit=45084 read=1
                    ->  Hash  (cost=250.42..250.42 rows=200 width=64) (actual time=1.336..1.340 rows=1.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=4
                          ->  Subquery Scan on cs  (cost=245.92..250.42 rows=200 width=64) (actual time=1.325..1.330 rows=1.00 loops=1)
                                Buffers: shared hit=4
                                ->  HashAggregate  (cost=245.92..248.42 rows=200 width=64) (actual time=1.325..1.328 rows=1.00 loops=1)
                                      Group Key: s.internal_customer_id
                                      Batches: 1  Memory Usage: 32kB
                                      Buffers: shared hit=4
                                      ->  Subquery Scan on s  (cost=190.10..230.70 rows=2030 width=298) (actual time=1.305..1.314 rows=1.00 loops=1)
                                            Buffers: shared hit=4
                                            ->  HashAggregate  (cost=190.10..210.40 rows=2030 width=213) (actual time=1.299..1.307 rows=1.00 loops=1)
                                                  Group Key: cpwp_1.internal_customer_id, s_1.id, s_1.stripe_id, s_1.stripe_schedule_id, s_1.created_at, s_1.usage_features, s_1.metadata, s_1.org_id, s_1.env, s_1.current_period_start, s_1.current_period_end
                                                  Batches: 1  Memory Usage: 105kB
                                                  Buffers: shared hit=4
                                                  ->  Nested Loop  (cost=0.43..134.27 rows=2030 width=213) (actual time=0.700..1.283 rows=1.00 loops=1)
                                                        Buffers: shared hit=4
                                                        ->  Nested Loop  (cost=0.00..80.00 rows=2000 width=64) (actual time=0.665..1.246 rows=1.00 loops=1)
                                                              ->  CTE Scan on customer_products_with_prices cpwp_1  (cost=0.00..40.00 rows=2000 width=64) (actual time=0.001..0.518 rows=1000.00 loops=1)
                                                                    Storage: Memory  Maximum Storage: 3903kB
                                                              ->  Function Scan on unnest cpwp_sub  (cost=0.00..0.01 rows=1 width=32) (actual time=0.000..0.000 rows=0.00 loops=1000)
                                                        ->  Memoize  (cost=0.43..2.15 rows=1 width=181) (actual time=0.031..0.033 rows=1.00 loops=1)
                                                              Cache Key: cpwp_sub.stripe_id
                                                              Cache Mode: logical
                                                              Hits: 0  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                                              Buffers: shared hit=4
                                                              ->  Index Scan using idx_subscriptions_stripe_id on subscriptions s_1  (cost=0.42..2.14 rows=1 width=181) (actual time=0.028..0.029 rows=1.00 loops=1)
                                                                    Index Cond: (stripe_id = cpwp_sub.stripe_id)
                                                                    Index Searches: 1
                                                                    Buffers: shared hit=4
Planning:
  Buffers: shared hit=39
Planning Time: 1.726 ms
Execution Time: 781.850 ms
```

### 04 offset / search "@gmail" / deep (offset 550881) / limit 1000

```
Sort  (cost=292545.39..292547.89 rows=1000 width=609) (actual time=3053.228..3053.245 rows=0.00 loops=1)
  Sort Key: cr.created_at DESC
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=1214819
  CTE customer_records
    ->  Limit  (cost=219611.61..220010.26 rows=1000 width=573) (actual time=3053.216..3053.217 rows=0.00 loops=1)
          Buffers: shared hit=1214819
          ->  Index Scan using idx_customers_org_id_env_created_at on customers c  (cost=0.56..269609.23 rows=676297 width=573) (actual time=0.039..3043.394 rows=183633.00 loops=1)
                Index Cond: ((org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'::text) AND (env = 'live'::text))
                Filter: ((id ~~* '%@gmail%'::text) OR (name ~~* '%@gmail%'::text) OR (email ~~* '%@gmail%'::text))
                Rows Removed by Filter: 1040554
                Index Searches: 1
                Buffers: shared hit=1214819
  CTE customer_products_with_prices
    ->  Nested Loop Left Join  (cost=1022.42..12375.95 rows=2000 width=678) (never executed)
          ->  Nested Loop Left Join  (cost=1022.12..12309.95 rows=2000 width=864) (never executed)
                ->  Nested Loop Left Join  (cost=16.29..9243.47 rows=2000 width=832) (never executed)
                      ->  Nested Loop  (cost=9.48..9173.04 rows=2000 width=800) (never executed)
                            ->  Nested Loop  (cost=9.05..9116.65 rows=2000 width=550) (never executed)
                                  ->  CTE Scan on customer_records cr_2  (cost=0.00..20.00 rows=1000 width=32) (never executed)
                                        Storage: Memory  Maximum Storage: 17kB
                                  ->  Limit  (cost=9.05..9.06 rows=2 width=551) (never executed)
                                        ->  Sort  (cost=9.05..9.06 rows=2 width=551) (never executed)
                                              Sort Key: ((SubPlan 2)), cp.created_at DESC
                                              ->  Index Scan using customer_products_internal_customer_id_idx on customer_products cp  (cost=0.56..9.04 rows=2 width=551) (never executed)
                                                    Index Cond: (internal_customer_id = cr_2.internal_id)
                                                    Filter: (status = ANY ('{active,past_due,scheduled}'::text[]))
                                                    Index Searches: 0
                                                    SubPlan 2
                                                      ->  Index Scan using plans_pkey on products p  (cost=0.41..2.13 rows=1 width=1) (never executed)
                                                            Index Cond: (internal_id = cp.internal_product_id)
                                                            Index Searches: 0
                            ->  Memoize  (cost=0.42..2.14 rows=1 width=282) (never executed)
                                  Cache Key: cp.internal_product_id
                                  Cache Mode: logical
                                  ->  Index Scan using plans_pkey on products prod  (cost=0.41..2.13 rows=1 width=282) (never executed)
                                        Index Cond: (internal_id = cp.internal_product_id)
                                        Index Searches: 0
                      ->  Memoize  (cost=6.81..6.82 rows=1 width=32) (never executed)
                            Cache Key: cp.id
                            Cache Mode: binary
                            ->  Aggregate  (cost=6.80..6.81 rows=1 width=32) (never executed)
                                  ->  Nested Loop Left Join  (cost=0.84..6.78 rows=2 width=871) (never executed)
                                        ->  Index Scan using idx_customer_prices_product_id on customer_prices cpr  (cost=0.42..2.51 rows=2 width=269) (never executed)
                                              Index Cond: (customer_product_id = cp.id)
                                              Index Searches: 0
                                        ->  Index Scan using prices_pkey on prices p_1  (cost=0.42..2.13 rows=1 width=664) (never executed)
                                              Index Cond: (id = cpr.price_id)
                                              Index Searches: 0
                ->  Memoize  (cost=1005.83..1005.84 rows=1 width=32) (never executed)
                      Cache Key: cp.id
                      Cache Mode: binary
                      ->  Aggregate  (cost=1005.82..1005.83 rows=1 width=32) (never executed)
                            ->  Index Scan using idx_customer_entitlements_product_id on customer_entitlements ce_2  (cost=0.56..78.98 rows=106 width=537) (never executed)
                                  Index Cond: (customer_product_id = cp.id)
                                  Index Searches: 0
                            SubPlan 3
                              ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (never executed)
                                    ->  Index Scan using entitlements_pkey on entitlements e  (cost=0.43..2.15 rows=1 width=359) (never executed)
                                          Index Cond: (id = ce_2.entitlement_id)
                                          Index Searches: 0
                                    ->  Index Scan using features_pkey on features f  (cost=0.41..2.13 rows=1 width=349) (never executed)
                                          Index Cond: (internal_id = (e.internal_feature_id)::text)
                                          Index Searches: 0
                            SubPlan 4
                              ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (never executed)
                                    ->  Seq Scan on replaceables r  (cost=0.00..1.12 rows=2 width=154) (never executed)
                                          Filter: (cus_ent_id = ce_2.id)
                            SubPlan 5
                              ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (never executed)
                                    ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro  (cost=0.56..3.23 rows=4 width=125) (never executed)
                                          Index Cond: (cus_ent_id = ce_2.id)
                                          Index Searches: 0
          ->  Memoize  (cost=0.30..2.01 rows=1 width=139) (never executed)
                Cache Key: cp.free_trial_id
                Cache Mode: logical
                ->  Index Scan using free_trials_pkey on free_trials ft  (cost=0.29..2.00 rows=1 width=139) (never executed)
                      Index Cond: (id = cp.free_trial_id)
                      Index Searches: 0
  ->  Hash Right Join  (cost=7580.65..60109.35 rows=1000 width=609) (actual time=3053.224..3053.232 rows=0.00 loops=1)
        Hash Cond: (cr_1.internal_id = cr.internal_id)
        Buffers: shared hit=1214819
        ->  GroupAggregate  (cost=7106.61..59611.57 rows=1000 width=64) (never executed)
              Group Key: cr_1.internal_id
              ->  Sort  (cost=7106.61..7121.61 rows=6000 width=569) (never executed)
                    Sort Key: cr_1.internal_id COLLATE "C"
                    ->  Nested Loop Left Join  (cost=6.58..6730.09 rows=6000 width=569) (never executed)
                          ->  CTE Scan on customer_records cr_1  (cost=0.00..20.00 rows=1000 width=32) (never executed)
                                Storage: Memory  Maximum Storage: 17kB
                          ->  Subquery Scan on ce  (cost=6.58..6.65 rows=6 width=537) (never executed)
                                ->  Limit  (cost=6.58..6.59 rows=6 width=445) (never executed)
                                      ->  Sort  (cost=6.58..6.59 rows=6 width=445) (never executed)
                                            Sort Key: ce_1.id DESC
                                            ->  Index Scan using idx_customer_entitlements_loose_customer_expires on customer_entitlements ce_1  (cost=0.43..6.50 rows=6 width=445) (never executed)
                                                  Index Cond: (internal_customer_id = cr_1.internal_id)
                                                  Filter: ((expires_at IS NULL) OR (expires_at > (EXTRACT(epoch FROM now()) * '1000'::numeric)))
                                                  Index Searches: 0
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
                ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (never executed)
                      ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro_1  (cost=0.56..3.23 rows=4 width=125) (never executed)
                            Index Cond: (cus_ent_id = ce.id)
                            Index Searches: 0
        ->  Hash  (cost=461.54..461.54 rows=1000 width=577) (actual time=3053.221..3053.226 rows=0.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 8kB
              Buffers: shared hit=1214819
              ->  Hash Left Join  (cost=436.26..461.54 rows=1000 width=577) (actual time=3053.220..3053.224 rows=0.00 loops=1)
                    Hash Cond: (cr.internal_id = cs.internal_customer_id)
                    Buffers: shared hit=1214819
                    ->  Hash Left Join  (cost=183.34..205.98 rows=1000 width=545) (actual time=3053.219..3053.221 rows=0.00 loops=1)
                          Hash Cond: (cr.internal_id = cpa.internal_customer_id)
                          Buffers: shared hit=1214819
                          ->  CTE Scan on customer_records cr  (cost=0.00..20.00 rows=1000 width=513) (actual time=3053.218..3053.218 rows=0.00 loops=1)
                                Storage: Memory  Maximum Storage: 17kB
                                Buffers: shared hit=1214819
                          ->  Hash  (cost=178.46..178.46 rows=391 width=64) (never executed)
                                ->  Subquery Scan on cpa  (cost=149.66..178.46 rows=391 width=64) (never executed)
                                      ->  GroupAggregate  (cost=149.66..174.55 rows=391 width=64) (never executed)
                                            Group Key: cpwp.internal_customer_id
                                            ->  Sort  (cost=149.66..154.66 rows=2000 width=152) (never executed)
                                                  Sort Key: cpwp.internal_customer_id COLLATE "C", cpwp.created_at DESC
                                                  ->  CTE Scan on customer_products_with_prices cpwp  (cost=0.00..40.00 rows=2000 width=152) (never executed)
                                                        Storage: Memory  Maximum Storage: 17kB
                    ->  Hash  (cost=250.42..250.42 rows=200 width=64) (never executed)
                          ->  Subquery Scan on cs  (cost=245.92..250.42 rows=200 width=64) (never executed)
                                ->  HashAggregate  (cost=245.92..248.42 rows=200 width=64) (never executed)
                                      Group Key: s.internal_customer_id
                                      ->  Subquery Scan on s  (cost=190.10..230.70 rows=2030 width=298) (never executed)
                                            ->  HashAggregate  (cost=190.10..210.40 rows=2030 width=213) (never executed)
                                                  Group Key: cpwp_1.internal_customer_id, s_1.id, s_1.stripe_id, s_1.stripe_schedule_id, s_1.created_at, s_1.usage_features, s_1.metadata, s_1.org_id, s_1.env, s_1.current_period_start, s_1.current_period_end
                                                  ->  Nested Loop  (cost=0.43..134.27 rows=2030 width=213) (never executed)
                                                        ->  Nested Loop  (cost=0.00..80.00 rows=2000 width=64) (never executed)
                                                              ->  CTE Scan on customer_products_with_prices cpwp_1  (cost=0.00..40.00 rows=2000 width=64) (never executed)
                                                                    Storage: Memory  Maximum Storage: 17kB
                                                              ->  Function Scan on unnest cpwp_sub  (cost=0.00..0.01 rows=1 width=32) (never executed)
                                                        ->  Memoize  (cost=0.43..2.15 rows=1 width=181) (never executed)
                                                              Cache Key: cpwp_sub.stripe_id
                                                              Cache Mode: logical
                                                              ->  Index Scan using idx_subscriptions_stripe_id on subscriptions s_1  (cost=0.42..2.14 rows=1 width=181) (never executed)
                                                                    Index Cond: (stripe_id = cpwp_sub.stripe_id)
                                                                    Index Searches: 0
Planning:
  Buffers: shared hit=54 read=1
Planning Time: 2.416 ms
Execution Time: 3053.608 ms
```

### 05 count / filtered search "@gmail"

```
Finalize Aggregate  (cost=254515.37..254515.38 rows=1 width=4) (actual time=770.319..835.548 rows=1.00 loops=1)
  Buffers: shared hit=267594
  ->  Gather  (cost=254514.95..254515.36 rows=4 width=8) (actual time=770.097..835.540 rows=5.00 loops=1)
        Workers Planned: 4
        Workers Launched: 4
        Buffers: shared hit=267594
        ->  Partial Aggregate  (cost=253514.95..253514.96 rows=1 width=8) (actual time=764.649..764.650 rows=1.00 loops=5)
              Buffers: shared hit=267574
              ->  Parallel Seq Scan on customers c  (cost=0.00..253092.26 rows=169075 width=0) (actual time=37.882..761.621 rows=36726.80 loops=5)
                    Filter: ((org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'::text) AND (env = 'live'::text) AND ((id ~~* '%@gmail%'::text) OR (name ~~* '%@gmail%'::text) OR (email ~~* '%@gmail%'::text)))
                    Rows Removed by Filter: 875409
                    Buffers: shared hit=267574
Planning:
  Buffers: shared hit=3
Planning Time: 0.290 ms
Execution Time: 835.614 ms
```

### 07 cursor / no filter / first page / limit 1000

```
Sort  (cost=72822.51..72825.01 rows=1001 width=609) (actual time=193.848..193.991 rows=1001.00 loops=1)
  Sort Key: cr.created_at DESC, cr.id DESC
  Sort Method: quicksort  Memory: 6626kB
  Buffers: shared hit=59445
  CTE customer_records
    ->  Limit  (cost=0.56..217.82 rows=1001 width=573) (actual time=0.033..1.083 rows=1001.00 loops=1)
          Buffers: shared hit=768
          ->  Index Scan using idx_customers_cursor on customers c  (cost=0.56..263036.28 rows=1211890 width=573) (actual time=0.033..0.976 rows=1001.00 loops=1)
                Index Cond: ((org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'::text) AND (env = 'live'::text))
                Index Searches: 1
                Buffers: shared hit=768
  CTE customer_products_with_prices
    ->  Nested Loop Left Join  (cost=1022.42..12385.28 rows=2002 width=678) (actual time=0.255..124.997 rows=1001.00 loops=1)
          Buffers: shared hit=44687
          ->  Nested Loop Left Join  (cost=1022.12..12319.22 rows=2002 width=864) (actual time=0.248..121.681 rows=1001.00 loops=1)
                Buffers: shared hit=44687
                ->  Nested Loop Left Join  (cost=16.29..9252.69 rows=2002 width=832) (actual time=0.065..19.549 rows=1001.00 loops=1)
                      Buffers: shared hit=12872
                      ->  Nested Loop  (cost=9.48..9182.21 rows=2002 width=800) (actual time=0.049..11.937 rows=1001.00 loops=1)
                            Buffers: shared hit=9797
                            ->  Nested Loop  (cost=9.05..9125.77 rows=2002 width=550) (actual time=0.038..11.344 rows=1001.00 loops=1)
                                  Buffers: shared hit=9777
                                  ->  CTE Scan on customer_records cr_2  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.000..1.554 rows=1001.00 loops=1)
                                        Storage: Memory  Maximum Storage: 811kB
                                        Buffers: shared hit=763
                                  ->  Limit  (cost=9.05..9.06 rows=2 width=551) (actual time=0.009..0.009 rows=1.00 loops=1001)
                                        Buffers: shared hit=9014
                                        ->  Sort  (cost=9.05..9.06 rows=2 width=551) (actual time=0.009..0.009 rows=1.00 loops=1001)
                                              Sort Key: ((SubPlan 2)), cp.created_at DESC
                                              Sort Method: quicksort  Memory: 25kB
                                              Buffers: shared hit=9014
                                              ->  Index Scan using customer_products_internal_customer_id_idx on customer_products cp  (cost=0.56..9.04 rows=2 width=551) (actual time=0.007..0.007 rows=1.00 loops=1001)
                                                    Index Cond: (internal_customer_id = cr_2.internal_id)
                                                    Filter: (status = ANY ('{active,past_due,scheduled}'::text[]))
                                                    Rows Removed by Filter: 0
                                                    Index Searches: 1001
                                                    Buffers: shared hit=9014
                                                    SubPlan 2
                                                      ->  Index Scan using plans_pkey on products p  (cost=0.41..2.13 rows=1 width=1) (actual time=0.004..0.004 rows=1.00 loops=1001)
                                                            Index Cond: (internal_id = cp.internal_product_id)
                                                            Index Searches: 1001
                                                            Buffers: shared hit=4004
                            ->  Memoize  (cost=0.42..2.14 rows=1 width=282) (actual time=0.000..0.000 rows=1.00 loops=1001)
                                  Cache Key: cp.internal_product_id
                                  Cache Mode: logical
                                  Hits: 996  Misses: 5  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                  Buffers: shared hit=20
                                  ->  Index Scan using plans_pkey on products prod  (cost=0.41..2.13 rows=1 width=282) (actual time=0.005..0.005 rows=1.00 loops=5)
                                        Index Cond: (internal_id = cp.internal_product_id)
                                        Index Searches: 5
                                        Buffers: shared hit=20
                      ->  Memoize  (cost=6.81..6.82 rows=1 width=32) (actual time=0.007..0.007 rows=1.00 loops=1001)
                            Cache Key: cp.id
                            Cache Mode: binary
                            Hits: 0  Misses: 1001  Evictions: 0  Overflows: 0  Memory Usage: 148kB
                            Buffers: shared hit=3075
                            ->  Aggregate  (cost=6.80..6.81 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1001)
                                  Buffers: shared hit=3075
                                  ->  Nested Loop Left Join  (cost=0.84..6.78 rows=2 width=871) (actual time=0.006..0.006 rows=0.02 loops=1001)
                                        Buffers: shared hit=3075
                                        ->  Index Scan using idx_customer_prices_product_id on customer_prices cpr  (cost=0.42..2.51 rows=2 width=269) (actual time=0.006..0.006 rows=0.02 loops=1001)
                                              Index Cond: (customer_product_id = cp.id)
                                              Index Searches: 1001
                                              Buffers: shared hit=3011
                                        ->  Index Scan using prices_pkey on prices p_1  (cost=0.42..2.13 rows=1 width=664) (actual time=0.004..0.005 rows=1.00 loops=16)
                                              Index Cond: (id = cpr.price_id)
                                              Index Searches: 16
                                              Buffers: shared hit=64
                ->  Memoize  (cost=1005.83..1005.84 rows=1 width=32) (actual time=0.101..0.102 rows=1.00 loops=1001)
                      Cache Key: cp.id
                      Cache Mode: binary
                      Hits: 0  Misses: 1001  Evictions: 0  Overflows: 0  Memory Usage: 3378kB
                      Buffers: shared hit=31815
                      ->  Aggregate  (cost=1005.82..1005.83 rows=1 width=32) (actual time=0.100..0.100 rows=1.00 loops=1001)
                            Buffers: shared hit=31815
                            ->  Index Scan using idx_customer_entitlements_product_id on customer_entitlements ce_2  (cost=0.56..78.98 rows=106 width=537) (actual time=0.009..0.011 rows=2.01 loops=1001)
                                  Index Cond: (customer_product_id = cp.id)
                                  Index Searches: 1001
                                  Buffers: shared hit=5685
                            SubPlan 3
                              ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.009..0.009 rows=1.00 loops=2010)
                                    Buffers: shared hit=16080
                                    ->  Index Scan using entitlements_pkey on entitlements e  (cost=0.43..2.15 rows=1 width=359) (actual time=0.001..0.002 rows=1.00 loops=2010)
                                          Index Cond: (id = ce_2.entitlement_id)
                                          Index Searches: 2010
                                          Buffers: shared hit=8040
                                    ->  Index Scan using features_pkey on features f  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=2010)
                                          Index Cond: (internal_id = (e.internal_feature_id)::text)
                                          Index Searches: 2010
                                          Buffers: shared hit=8040
                            SubPlan 4
                              ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=2010)
                                    Buffers: shared hit=2010
                                    ->  Seq Scan on replaceables r  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=2010)
                                          Filter: (cus_ent_id = ce_2.id)
                                          Rows Removed by Filter: 21
                                          Buffers: shared hit=2010
                            SubPlan 5
                              ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=2010)
                                    Buffers: shared hit=8040
                                    ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro  (cost=0.56..3.23 rows=4 width=125) (actual time=0.005..0.005 rows=0.00 loops=2010)
                                          Index Cond: (cus_ent_id = ce_2.id)
                                          Index Searches: 2010
                                          Buffers: shared hit=8040
          ->  Memoize  (cost=0.30..2.01 rows=1 width=139) (actual time=0.000..0.000 rows=0.00 loops=1001)
                Cache Key: cp.free_trial_id
                Cache Mode: logical
                Hits: 1000  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                ->  Index Scan using free_trials_pkey on free_trials ft  (cost=0.29..2.00 rows=1 width=139) (actual time=0.000..0.001 rows=0.00 loops=1)
                      Index Cond: (id = cp.free_trial_id)
                      Index Searches: 0
  ->  Hash Right Join  (cost=7588.29..60169.53 rows=1001 width=609) (actual time=149.645..189.859 rows=1001.00 loops=1)
        Hash Cond: (cr_1.internal_id = cr.internal_id)
        Buffers: shared hit=59445
        ->  GroupAggregate  (cost=7113.76..59671.22 rows=1001 width=64) (actual time=5.800..45.287 rows=1001.00 loops=1)
              Group Key: cr_1.internal_id
              Buffers: shared hit=14721
              ->  Sort  (cost=7113.76..7128.78 rows=6006 width=569) (actual time=5.781..5.890 rows=1008.00 loops=1)
                    Sort Key: cr_1.internal_id COLLATE "C"
                    Sort Method: quicksort  Memory: 381kB
                    Buffers: shared hit=3840
                    ->  Nested Loop Left Join  (cost=6.58..6736.82 rows=6006 width=569) (actual time=0.028..5.097 rows=1008.00 loops=1)
                          Buffers: shared hit=3840
                          ->  CTE Scan on customer_records cr_1  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.000..0.179 rows=1001.00 loops=1)
                                Storage: Memory  Maximum Storage: 811kB
                          ->  Subquery Scan on ce  (cost=6.58..6.65 rows=6 width=537) (actual time=0.004..0.005 rows=0.84 loops=1001)
                                Buffers: shared hit=3840
                                ->  Limit  (cost=6.58..6.59 rows=6 width=445) (actual time=0.004..0.004 rows=0.84 loops=1001)
                                      Buffers: shared hit=3840
                                      ->  Sort  (cost=6.58..6.59 rows=6 width=445) (actual time=0.004..0.004 rows=0.84 loops=1001)
                                            Sort Key: ce_1.id DESC
                                            Sort Method: quicksort  Memory: 25kB
                                            Buffers: shared hit=3840
                                            ->  Index Scan using idx_customer_entitlements_loose_customer_expires on customer_entitlements ce_1  (cost=0.43..6.50 rows=6 width=445) (actual time=0.003..0.003 rows=0.84 loops=1001)
                                                  Index Cond: (internal_customer_id = cr_1.internal_id)
                                                  Filter: ((expires_at IS NULL) OR (expires_at > (EXTRACT(epoch FROM now()) * '1000'::numeric)))
                                                  Index Searches: 1001
                                                  Buffers: shared hit=3840
              SubPlan 7
                ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.010..0.010 rows=1.00 loops=837)
                      Buffers: shared hit=6696
                      ->  Index Scan using entitlements_pkey on entitlements e_1  (cost=0.43..2.15 rows=1 width=359) (actual time=0.002..0.002 rows=1.00 loops=837)
                            Index Cond: (id = ce.entitlement_id)
                            Index Searches: 837
                            Buffers: shared hit=3348
                      ->  Index Scan using features_pkey on features f_1  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=837)
                            Index Cond: (internal_id = (e_1.internal_feature_id)::text)
                            Index Searches: 837
                            Buffers: shared hit=3348
              SubPlan 8
                ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=837)
                      Buffers: shared hit=837
                      ->  Seq Scan on replaceables r_1  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=837)
                            Filter: (cus_ent_id = ce.id)
                            Rows Removed by Filter: 21
                            Buffers: shared hit=837
              SubPlan 9
                ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=837)
                      Buffers: shared hit=3348
                      ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro_1  (cost=0.56..3.23 rows=4 width=125) (actual time=0.005..0.005 rows=0.00 loops=837)
                            Index Cond: (cus_ent_id = ce.id)
                            Index Searches: 837
                            Buffers: shared hit=3348
        ->  Hash  (cost=462.02..462.02 rows=1001 width=577) (actual time=143.839..143.848 rows=1001.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 5285kB
              Buffers: shared hit=44724
              ->  Hash Left Join  (cost=436.72..462.02 rows=1001 width=577) (actual time=139.724..140.601 rows=1001.00 loops=1)
                    Hash Cond: (cr.internal_id = cs.internal_customer_id)
                    Buffers: shared hit=44724
                    ->  Hash Left Join  (cost=183.56..206.22 rows=1001 width=545) (actual time=138.457..139.126 rows=1001.00 loops=1)
                          Hash Cond: (cr.internal_id = cpa.internal_customer_id)
                          Buffers: shared hit=44692
                          ->  CTE Scan on customer_records cr  (cost=0.00..20.02 rows=1001 width=513) (actual time=0.034..0.207 rows=1001.00 loops=1)
                                Storage: Memory  Maximum Storage: 811kB
                                Buffers: shared hit=5
                          ->  Hash  (cost=178.66..178.66 rows=392 width=64) (actual time=138.418..138.420 rows=1001.00 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 4544kB
                                Buffers: shared hit=44687
                                ->  Subquery Scan on cpa  (cost=149.82..178.66 rows=392 width=64) (actual time=130.064..136.443 rows=1001.00 loops=1)
                                      Buffers: shared hit=44687
                                      ->  GroupAggregate  (cost=149.82..174.74 rows=392 width=64) (actual time=130.062..136.322 rows=1001.00 loops=1)
                                            Group Key: cpwp.internal_customer_id
                                            Buffers: shared hit=44687
                                            ->  Sort  (cost=149.82..154.83 rows=2002 width=152) (actual time=130.047..130.194 rows=1001.00 loops=1)
                                                  Sort Key: cpwp.internal_customer_id COLLATE "C", cpwp.created_at DESC
                                                  Sort Method: quicksort  Memory: 4003kB
                                                  Buffers: shared hit=44687
                                                  ->  CTE Scan on customer_products_with_prices cpwp  (cost=0.00..40.04 rows=2002 width=152) (actual time=0.262..128.154 rows=1001.00 loops=1)
                                                        Storage: Memory  Maximum Storage: 3940kB
                                                        Buffers: shared hit=44687
                    ->  Hash  (cost=250.66..250.66 rows=200 width=64) (actual time=1.263..1.268 rows=8.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 12kB
                          Buffers: shared hit=32
                          ->  Subquery Scan on cs  (cost=246.16..250.66 rows=200 width=64) (actual time=1.254..1.261 rows=8.00 loops=1)
                                Buffers: shared hit=32
                                ->  HashAggregate  (cost=246.16..248.66 rows=200 width=64) (actual time=1.253..1.258 rows=8.00 loops=1)
                                      Group Key: s.internal_customer_id
                                      Batches: 1  Memory Usage: 40kB
                                      Buffers: shared hit=32
                                      ->  Subquery Scan on s  (cost=190.28..230.92 rows=2032 width=298) (actual time=1.205..1.224 rows=8.00 loops=1)
                                            Buffers: shared hit=32
                                            ->  HashAggregate  (cost=190.28..210.60 rows=2032 width=213) (actual time=1.200..1.215 rows=8.00 loops=1)
                                                  Group Key: cpwp_1.internal_customer_id, s_1.id, s_1.stripe_id, s_1.stripe_schedule_id, s_1.created_at, s_1.usage_features, s_1.metadata, s_1.org_id, s_1.env, s_1.current_period_start, s_1.current_period_end
                                                  Batches: 1  Memory Usage: 105kB
                                                  Buffers: shared hit=32
                                                  ->  Nested Loop  (cost=0.43..134.40 rows=2032 width=213) (actual time=0.481..1.183 rows=8.00 loops=1)
                                                        Buffers: shared hit=32
                                                        ->  Nested Loop  (cost=0.00..80.08 rows=2002 width=64) (actual time=0.448..1.097 rows=8.00 loops=1)
                                                              ->  CTE Scan on customer_products_with_prices cpwp_1  (cost=0.00..40.04 rows=2002 width=64) (actual time=0.001..0.458 rows=1001.00 loops=1)
                                                                    Storage: Memory  Maximum Storage: 3940kB
                                                              ->  Function Scan on unnest cpwp_sub  (cost=0.00..0.01 rows=1 width=32) (actual time=0.000..0.000 rows=0.01 loops=1001)
                                                        ->  Memoize  (cost=0.43..2.15 rows=1 width=181) (actual time=0.010..0.010 rows=1.00 loops=8)
                                                              Cache Key: cpwp_sub.stripe_id
                                                              Cache Mode: logical
                                                              Hits: 0  Misses: 8  Evictions: 0  Overflows: 0  Memory Usage: 3kB
                                                              Buffers: shared hit=32
                                                              ->  Index Scan using idx_subscriptions_stripe_id on subscriptions s_1  (cost=0.42..2.14 rows=1 width=181) (actual time=0.009..0.009 rows=1.00 loops=8)
                                                                    Index Cond: (stripe_id = cpwp_sub.stripe_id)
                                                                    Index Searches: 8
                                                                    Buffers: shared hit=32
Planning:
  Buffers: shared hit=39
Planning Time: 1.546 ms
Execution Time: 194.334 ms
```

### 08 cursor / no filter / deep (via constructed cursor) / limit 1000

```
Sort  (cost=72932.60..72935.11 rows=1001 width=609) (actual time=210.467..210.540 rows=1001.00 loops=1)
  Sort Key: cr.created_at DESC, cr.id DESC
  Sort Method: quicksort  Memory: 7212kB
  Buffers: shared hit=64768
  CTE customer_records
    ->  Limit  (cost=0.56..327.91 rows=1001 width=573) (actual time=0.027..1.787 rows=1001.00 loops=1)
          Buffers: shared hit=1017
          ->  Index Scan using idx_customers_cursor on customers c  (cost=0.56..250661.13 rows=766482 width=573) (actual time=0.027..1.691 rows=1001.00 loops=1)
                Index Cond: ((org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'::text) AND (env = 'live'::text) AND (ROW(created_at, id) < ROW('1774237983362'::numeric, 'b2f40a0e-3e60-4e12-bef5-eba5151ecc2e'::text)))
                Index Searches: 1
                Buffers: shared hit=1017
  CTE customer_products_with_prices
    ->  Nested Loop Left Join  (cost=1022.42..12385.28 rows=2002 width=678) (actual time=0.305..127.746 rows=1001.00 loops=1)
          Buffers: shared hit=45147
          ->  Nested Loop Left Join  (cost=1022.12..12319.22 rows=2002 width=864) (actual time=0.295..124.265 rows=1001.00 loops=1)
                Buffers: shared hit=45147
                ->  Nested Loop Left Join  (cost=16.29..9252.69 rows=2002 width=832) (actual time=0.079..20.387 rows=1001.00 loops=1)
                      Buffers: shared hit=14047
                      ->  Nested Loop  (cost=9.48..9182.21 rows=2002 width=800) (actual time=0.061..13.517 rows=1001.00 loops=1)
                            Buffers: shared hit=11035
                            ->  Nested Loop  (cost=9.05..9125.77 rows=2002 width=550) (actual time=0.033..12.911 rows=1001.00 loops=1)
                                  Buffers: shared hit=11027
                                  ->  CTE Scan on customer_records cr_2  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.000..2.401 rows=1001.00 loops=1)
                                        Storage: Memory  Maximum Storage: 840kB
                                        Buffers: shared hit=1012
                                  ->  Limit  (cost=9.05..9.06 rows=2 width=551) (actual time=0.010..0.010 rows=1.00 loops=1001)
                                        Buffers: shared hit=10015
                                        ->  Sort  (cost=9.05..9.06 rows=2 width=551) (actual time=0.009..0.010 rows=1.00 loops=1001)
                                              Sort Key: ((SubPlan 2)), cp.created_at DESC
                                              Sort Method: quicksort  Memory: 25kB
                                              Buffers: shared hit=10015
                                              ->  Index Scan using customer_products_internal_customer_id_idx on customer_products cp  (cost=0.56..9.04 rows=2 width=551) (actual time=0.008..0.008 rows=1.00 loops=1001)
                                                    Index Cond: (internal_customer_id = cr_2.internal_id)
                                                    Filter: (status = ANY ('{active,past_due,scheduled}'::text[]))
                                                    Rows Removed by Filter: 1
                                                    Index Searches: 1001
                                                    Buffers: shared hit=10015
                                                    SubPlan 2
                                                      ->  Index Scan using plans_pkey on products p  (cost=0.41..2.13 rows=1 width=1) (actual time=0.004..0.004 rows=1.00 loops=1001)
                                                            Index Cond: (internal_id = cp.internal_product_id)
                                                            Index Searches: 1001
                                                            Buffers: shared hit=4004
                            ->  Memoize  (cost=0.42..2.14 rows=1 width=282) (actual time=0.000..0.000 rows=1.00 loops=1001)
                                  Cache Key: cp.internal_product_id
                                  Cache Mode: logical
                                  Hits: 999  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                  Buffers: shared hit=8
                                  ->  Index Scan using plans_pkey on products prod  (cost=0.41..2.13 rows=1 width=282) (actual time=0.014..0.014 rows=1.00 loops=2)
                                        Index Cond: (internal_id = cp.internal_product_id)
                                        Index Searches: 2
                                        Buffers: shared hit=8
                      ->  Memoize  (cost=6.81..6.82 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1001)
                            Cache Key: cp.id
                            Cache Mode: binary
                            Hits: 0  Misses: 1001  Evictions: 0  Overflows: 0  Memory Usage: 135kB
                            Buffers: shared hit=3012
                            ->  Aggregate  (cost=6.80..6.81 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1001)
                                  Buffers: shared hit=3012
                                  ->  Nested Loop Left Join  (cost=0.84..6.78 rows=2 width=871) (actual time=0.005..0.005 rows=0.00 loops=1001)
                                        Buffers: shared hit=3012
                                        ->  Index Scan using idx_customer_prices_product_id on customer_prices cpr  (cost=0.42..2.51 rows=2 width=269) (actual time=0.005..0.005 rows=0.00 loops=1001)
                                              Index Cond: (customer_product_id = cp.id)
                                              Index Searches: 1001
                                              Buffers: shared hit=3004
                                        ->  Index Scan using prices_pkey on prices p_1  (cost=0.42..2.13 rows=1 width=664) (actual time=0.007..0.007 rows=1.00 loops=2)
                                              Index Cond: (id = cpr.price_id)
                                              Index Searches: 2
                                              Buffers: shared hit=8
                ->  Memoize  (cost=1005.83..1005.84 rows=1 width=32) (actual time=0.103..0.103 rows=1.00 loops=1001)
                      Cache Key: cp.id
                      Cache Mode: binary
                      Hits: 0  Misses: 1001  Evictions: 0  Overflows: 0  Memory Usage: 3367kB
                      Buffers: shared hit=31100
                      ->  Aggregate  (cost=1005.82..1005.83 rows=1 width=32) (actual time=0.102..0.102 rows=1.00 loops=1001)
                            Buffers: shared hit=31100
                            ->  Index Scan using idx_customer_entitlements_product_id on customer_entitlements ce_2  (cost=0.56..78.98 rows=106 width=537) (actual time=0.009..0.010 rows=2.00 loops=1001)
                                  Index Cond: (customer_product_id = cp.id)
                                  Index Searches: 1001
                                  Buffers: shared hit=5061
                            SubPlan 3
                              ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.009..0.010 rows=1.00 loops=2003)
                                    Buffers: shared hit=16024
                                    ->  Index Scan using entitlements_pkey on entitlements e  (cost=0.43..2.15 rows=1 width=359) (actual time=0.002..0.002 rows=1.00 loops=2003)
                                          Index Cond: (id = ce_2.entitlement_id)
                                          Index Searches: 2003
                                          Buffers: shared hit=8012
                                    ->  Index Scan using features_pkey on features f  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=2003)
                                          Index Cond: (internal_id = (e.internal_feature_id)::text)
                                          Index Searches: 2003
                                          Buffers: shared hit=8012
                            SubPlan 4
                              ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=2003)
                                    Buffers: shared hit=2003
                                    ->  Seq Scan on replaceables r  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=2003)
                                          Filter: (cus_ent_id = ce_2.id)
                                          Rows Removed by Filter: 21
                                          Buffers: shared hit=2003
                            SubPlan 5
                              ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=2003)
                                    Buffers: shared hit=8012
                                    ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro  (cost=0.56..3.23 rows=4 width=125) (actual time=0.005..0.005 rows=0.00 loops=2003)
                                          Index Cond: (cus_ent_id = ce_2.id)
                                          Index Searches: 2003
                                          Buffers: shared hit=8012
          ->  Memoize  (cost=0.30..2.01 rows=1 width=139) (actual time=0.000..0.000 rows=0.00 loops=1001)
                Cache Key: cp.free_trial_id
                Cache Mode: logical
                Hits: 1000  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                ->  Index Scan using free_trials_pkey on free_trials ft  (cost=0.29..2.00 rows=1 width=139) (actual time=0.001..0.001 rows=0.00 loops=1)
                      Index Cond: (id = cp.free_trial_id)
                      Index Searches: 0
  ->  Hash Right Join  (cost=7588.29..60169.53 rows=1001 width=609) (actual time=150.805..205.065 rows=1001.00 loops=1)
        Hash Cond: (cr_1.internal_id = cr.internal_id)
        Buffers: shared hit=64768
        ->  GroupAggregate  (cost=7113.76..59671.22 rows=1001 width=64) (actual time=5.344..58.872 rows=1001.00 loops=1)
              Group Key: cr_1.internal_id
              Buffers: shared hit=19612
              ->  Sort  (cost=7113.76..7128.78 rows=6006 width=569) (actual time=5.186..5.362 rows=1468.00 loops=1)
                    Sort Key: cr_1.internal_id COLLATE "C"
                    Sort Method: quicksort  Memory: 584kB
                    Buffers: shared hit=4194
                    ->  Nested Loop Left Join  (cost=6.58..6736.82 rows=6006 width=569) (actual time=0.035..4.364 rows=1468.00 loops=1)
                          Buffers: shared hit=4194
                          ->  CTE Scan on customer_records cr_1  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.000..0.149 rows=1001.00 loops=1)
                                Storage: Memory  Maximum Storage: 840kB
                          ->  Subquery Scan on ce  (cost=6.58..6.65 rows=6 width=537) (actual time=0.003..0.004 rows=1.18 loops=1001)
                                Buffers: shared hit=4194
                                ->  Limit  (cost=6.58..6.59 rows=6 width=445) (actual time=0.003..0.003 rows=1.18 loops=1001)
                                      Buffers: shared hit=4194
                                      ->  Sort  (cost=6.58..6.59 rows=6 width=445) (actual time=0.003..0.003 rows=1.18 loops=1001)
                                            Sort Key: ce_1.id DESC
                                            Sort Method: quicksort  Memory: 26kB
                                            Buffers: shared hit=4194
                                            ->  Index Scan using idx_customer_entitlements_loose_customer_expires on customer_entitlements ce_1  (cost=0.43..6.50 rows=6 width=445) (actual time=0.002..0.002 rows=1.18 loops=1001)
                                                  Index Cond: (internal_customer_id = cr_1.internal_id)
                                                  Filter: ((expires_at IS NULL) OR (expires_at > (EXTRACT(epoch FROM now()) * '1000'::numeric)))
                                                  Rows Removed by Filter: 0
                                                  Index Searches: 1001
                                                  Buffers: shared hit=4194
              SubPlan 7
                ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.010..0.010 rows=1.00 loops=1186)
                      Buffers: shared hit=9488
                      ->  Index Scan using entitlements_pkey on entitlements e_1  (cost=0.43..2.15 rows=1 width=359) (actual time=0.002..0.002 rows=1.00 loops=1186)
                            Index Cond: (id = ce.entitlement_id)
                            Index Searches: 1186
                            Buffers: shared hit=4744
                      ->  Index Scan using features_pkey on features f_1  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=1186)
                            Index Cond: (internal_id = (e_1.internal_feature_id)::text)
                            Index Searches: 1186
                            Buffers: shared hit=4744
              SubPlan 8
                ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=1186)
                      Buffers: shared hit=1186
                      ->  Seq Scan on replaceables r_1  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=1186)
                            Filter: (cus_ent_id = ce.id)
                            Rows Removed by Filter: 21
                            Buffers: shared hit=1186
              SubPlan 9
                ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1186)
                      Buffers: shared hit=4744
                      ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro_1  (cost=0.56..3.23 rows=4 width=125) (actual time=0.005..0.005 rows=0.00 loops=1186)
                            Index Cond: (cus_ent_id = ce.id)
                            Index Searches: 1186
                            Buffers: shared hit=4744
        ->  Hash  (cost=462.02..462.02 rows=1001 width=577) (actual time=145.454..145.464 rows=1001.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 5279kB
              Buffers: shared hit=45156
              ->  Hash Left Join  (cost=436.72..462.02 rows=1001 width=577) (actual time=141.471..142.314 rows=1001.00 loops=1)
                    Hash Cond: (cr.internal_id = cs.internal_customer_id)
                    Buffers: shared hit=45156
                    ->  Hash Left Join  (cost=183.56..206.22 rows=1001 width=545) (actual time=140.377..141.035 rows=1001.00 loops=1)
                          Hash Cond: (cr.internal_id = cpa.internal_customer_id)
                          Buffers: shared hit=45152
                          ->  CTE Scan on customer_records cr  (cost=0.00..20.02 rows=1001 width=513) (actual time=0.028..0.164 rows=1001.00 loops=1)
                                Storage: Memory  Maximum Storage: 840kB
                                Buffers: shared hit=5
                          ->  Hash  (cost=178.66..178.66 rows=392 width=64) (actual time=140.344..140.346 rows=1001.00 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 4511kB
                                Buffers: shared hit=45147
                                ->  Subquery Scan on cpa  (cost=149.82..178.66 rows=392 width=64) (actual time=131.748..138.078 rows=1001.00 loops=1)
                                      Buffers: shared hit=45147
                                      ->  GroupAggregate  (cost=149.82..174.74 rows=392 width=64) (actual time=131.747..137.948 rows=1001.00 loops=1)
                                            Group Key: cpwp.internal_customer_id
                                            Buffers: shared hit=45147
                                            ->  Sort  (cost=149.82..154.83 rows=2002 width=152) (actual time=131.732..131.836 rows=1001.00 loops=1)
                                                  Sort Key: cpwp.internal_customer_id COLLATE "C", cpwp.created_at DESC
                                                  Sort Method: quicksort  Memory: 3970kB
                                                  Buffers: shared hit=45147
                                                  ->  CTE Scan on customer_products_with_prices cpwp  (cost=0.00..40.04 rows=2002 width=152) (actual time=0.316..130.597 rows=1001.00 loops=1)
                                                        Storage: Memory  Maximum Storage: 3906kB
                                                        Buffers: shared hit=45147
                    ->  Hash  (cost=250.66..250.66 rows=200 width=64) (actual time=1.090..1.095 rows=1.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=4
                          ->  Subquery Scan on cs  (cost=246.16..250.66 rows=200 width=64) (actual time=1.082..1.088 rows=1.00 loops=1)
                                Buffers: shared hit=4
                                ->  HashAggregate  (cost=246.16..248.66 rows=200 width=64) (actual time=1.081..1.086 rows=1.00 loops=1)
                                      Group Key: s.internal_customer_id
                                      Batches: 1  Memory Usage: 32kB
                                      Buffers: shared hit=4
                                      ->  Subquery Scan on s  (cost=190.28..230.92 rows=2032 width=298) (actual time=1.064..1.074 rows=1.00 loops=1)
                                            Buffers: shared hit=4
                                            ->  HashAggregate  (cost=190.28..210.60 rows=2032 width=213) (actual time=1.057..1.066 rows=1.00 loops=1)
                                                  Group Key: cpwp_1.internal_customer_id, s_1.id, s_1.stripe_id, s_1.stripe_schedule_id, s_1.created_at, s_1.usage_features, s_1.metadata, s_1.org_id, s_1.env, s_1.current_period_start, s_1.current_period_end
                                                  Batches: 1  Memory Usage: 105kB
                                                  Buffers: shared hit=4
                                                  ->  Nested Loop  (cost=0.43..134.40 rows=2032 width=213) (actual time=0.472..1.045 rows=1.00 loops=1)
                                                        Buffers: shared hit=4
                                                        ->  Nested Loop  (cost=0.00..80.08 rows=2002 width=64) (actual time=0.437..1.007 rows=1.00 loops=1)
                                                              ->  CTE Scan on customer_products_with_prices cpwp_1  (cost=0.00..40.04 rows=2002 width=64) (actual time=0.001..0.446 rows=1001.00 loops=1)
                                                                    Storage: Memory  Maximum Storage: 3906kB
                                                              ->  Function Scan on unnest cpwp_sub  (cost=0.00..0.01 rows=1 width=32) (actual time=0.000..0.000 rows=0.00 loops=1001)
                                                        ->  Memoize  (cost=0.43..2.15 rows=1 width=181) (actual time=0.033..0.034 rows=1.00 loops=1)
                                                              Cache Key: cpwp_sub.stripe_id
                                                              Cache Mode: logical
                                                              Hits: 0  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                                              Buffers: shared hit=4
                                                              ->  Index Scan using idx_subscriptions_stripe_id on subscriptions s_1  (cost=0.42..2.14 rows=1 width=181) (actual time=0.029..0.030 rows=1.00 loops=1)
                                                                    Index Cond: (stripe_id = cpwp_sub.stripe_id)
                                                                    Index Searches: 1
                                                                    Buffers: shared hit=4
Planning:
  Buffers: shared hit=45
Planning Time: 1.634 ms
Execution Time: 210.892 ms
```

### 09 cursor / search "@gmail" / deep / limit 1000

```
Sort  (cost=73205.30..73207.80 rows=1001 width=609) (actual time=1072.740..1072.935 rows=1001.00 loops=1)
  Sort Key: cr.created_at DESC, cr.id DESC
  Sort Method: quicksort  Memory: 9373kB
  Buffers: shared hit=294494
  CTE customer_records
    ->  Limit  (cost=0.56..600.61 rows=1001 width=573) (actual time=1.616..700.368 rows=1001.00 loops=1)
          Buffers: shared hit=213202
          ->  Index Scan using idx_customers_cursor on customers c  (cost=0.56..256410.68 rows=427742 width=573) (actual time=1.614..700.153 rows=1001.00 loops=1)
                Index Cond: ((org_id = 'biu9vSF7vghBLSKW1UTDwxHBAivjnPaK'::text) AND (env = 'live'::text) AND (ROW(created_at, id) < ROW('1774237983362'::numeric, 'b2f40a0e-3e60-4e12-bef5-eba5151ecc2e'::text)))
                Filter: ((id ~~* '%@gmail%'::text) OR (name ~~* '%@gmail%'::text) OR (email ~~* '%@gmail%'::text))
                Rows Removed by Filter: 209435
                Index Searches: 1
                Buffers: shared hit=213202
  CTE customer_products_with_prices
    ->  Nested Loop Left Join  (cost=1022.42..12385.28 rows=2002 width=678) (actual time=0.362..929.184 rows=1018.00 loops=1)
          Buffers: shared hit=263331
          ->  Nested Loop Left Join  (cost=1022.12..12319.22 rows=2002 width=864) (actual time=0.351..923.013 rows=1018.00 loops=1)
                Buffers: shared hit=263331
                ->  Nested Loop Left Join  (cost=16.29..9252.69 rows=2002 width=832) (actual time=0.100..749.352 rows=1018.00 loops=1)
                      Buffers: shared hit=228313
                      ->  Nested Loop  (cost=9.48..9182.21 rows=2002 width=800) (actual time=0.073..724.635 rows=1018.00 loops=1)
                            Buffers: shared hit=223316
                            ->  Nested Loop  (cost=9.05..9125.77 rows=2002 width=550) (actual time=0.050..723.197 rows=1018.00 loops=1)
                                  Buffers: shared hit=223288
                                  ->  CTE Scan on customer_records cr_2  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.001..699.630 rows=1001.00 loops=1)
                                        Storage: Memory  Maximum Storage: 942kB
                                        Buffers: shared hit=212873
                                  ->  Limit  (cost=9.05..9.06 rows=2 width=551) (actual time=0.022..0.022 rows=1.02 loops=1001)
                                        Buffers: shared hit=10415
                                        ->  Sort  (cost=9.05..9.06 rows=2 width=551) (actual time=0.021..0.021 rows=1.02 loops=1001)
                                              Sort Key: ((SubPlan 2)), cp.created_at DESC
                                              Sort Method: quicksort  Memory: 25kB
                                              Buffers: shared hit=10415
                                              ->  Index Scan using customer_products_internal_customer_id_idx on customer_products cp  (cost=0.56..9.04 rows=2 width=551) (actual time=0.017..0.018 rows=1.02 loops=1001)
                                                    Index Cond: (internal_customer_id = cr_2.internal_id)
                                                    Filter: (status = ANY ('{active,past_due,scheduled}'::text[]))
                                                    Rows Removed by Filter: 1
                                                    Index Searches: 1001
                                                    Buffers: shared hit=10415
                                                    SubPlan 2
                                                      ->  Index Scan using plans_pkey on products p  (cost=0.41..2.13 rows=1 width=1) (actual time=0.006..0.007 rows=1.00 loops=1018)
                                                            Index Cond: (internal_id = cp.internal_product_id)
                                                            Index Searches: 1018
                                                            Buffers: shared hit=4072
                            ->  Memoize  (cost=0.42..2.14 rows=1 width=282) (actual time=0.001..0.001 rows=1.00 loops=1018)
                                  Cache Key: cp.internal_product_id
                                  Cache Mode: logical
                                  Hits: 1011  Misses: 7  Evictions: 0  Overflows: 0  Memory Usage: 3kB
                                  Buffers: shared hit=28
                                  ->  Index Scan using plans_pkey on products prod  (cost=0.41..2.13 rows=1 width=282) (actual time=0.008..0.008 rows=1.00 loops=7)
                                        Index Cond: (internal_id = cp.internal_product_id)
                                        Index Searches: 7
                                        Buffers: shared hit=28
                      ->  Memoize  (cost=6.81..6.82 rows=1 width=32) (actual time=0.023..0.024 rows=1.00 loops=1018)
                            Cache Key: cp.id
                            Cache Mode: binary
                            Hits: 0  Misses: 1018  Evictions: 0  Overflows: 0  Memory Usage: 531kB
                            Buffers: shared hit=4997
                            ->  Aggregate  (cost=6.80..6.81 rows=1 width=32) (actual time=0.022..0.022 rows=1.00 loops=1018)
                                  Buffers: shared hit=4997
                                  ->  Nested Loop Left Join  (cost=0.84..6.78 rows=2 width=871) (actual time=0.011..0.012 rows=0.42 loops=1018)
                                        Buffers: shared hit=4997
                                        ->  Index Scan using idx_customer_prices_product_id on customer_prices cpr  (cost=0.42..2.51 rows=2 width=269) (actual time=0.009..0.009 rows=0.42 loops=1018)
                                              Index Cond: (customer_product_id = cp.id)
                                              Index Searches: 1018
                                              Buffers: shared hit=3277
                                        ->  Index Scan using prices_pkey on prices p_1  (cost=0.42..2.13 rows=1 width=664) (actual time=0.004..0.004 rows=1.00 loops=430)
                                              Index Cond: (id = cpr.price_id)
                                              Index Searches: 430
                                              Buffers: shared hit=1720
                ->  Memoize  (cost=1005.83..1005.84 rows=1 width=32) (actual time=0.170..0.170 rows=1.00 loops=1018)
                      Cache Key: cp.id
                      Cache Mode: binary
                      Hits: 0  Misses: 1018  Evictions: 0  Overflows: 0  Memory Usage: 3765kB
                      Buffers: shared hit=35018
                      ->  Aggregate  (cost=1005.82..1005.83 rows=1 width=32) (actual time=0.167..0.167 rows=1.00 loops=1018)
                            Buffers: shared hit=35018
                            ->  Index Scan using idx_customer_entitlements_product_id on customer_entitlements ce_2  (cost=0.56..78.98 rows=106 width=537) (actual time=0.015..0.018 rows=2.21 loops=1018)
                                  Index Cond: (customer_product_id = cp.id)
                                  Index Searches: 1018
                                  Buffers: shared hit=5755
                            SubPlan 3
                              ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.015..0.015 rows=1.00 loops=2251)
                                    Buffers: shared hit=18008
                                    ->  Index Scan using entitlements_pkey on entitlements e  (cost=0.43..2.15 rows=1 width=359) (actual time=0.003..0.003 rows=1.00 loops=2251)
                                          Index Cond: (id = ce_2.entitlement_id)
                                          Index Searches: 2251
                                          Buffers: shared hit=9004
                                    ->  Index Scan using features_pkey on features f  (cost=0.41..2.13 rows=1 width=349) (actual time=0.003..0.003 rows=1.00 loops=2251)
                                          Index Cond: (internal_id = (e.internal_feature_id)::text)
                                          Index Searches: 2251
                                          Buffers: shared hit=9004
                            SubPlan 4
                              ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.004..0.004 rows=1.00 loops=2251)
                                    Buffers: shared hit=2251
                                    ->  Seq Scan on replaceables r  (cost=0.00..1.12 rows=2 width=154) (actual time=0.003..0.003 rows=0.00 loops=2251)
                                          Filter: (cus_ent_id = ce_2.id)
                                          Rows Removed by Filter: 21
                                          Buffers: shared hit=2251
                            SubPlan 5
                              ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.009..0.009 rows=1.00 loops=2251)
                                    Buffers: shared hit=9004
                                    ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro  (cost=0.56..3.23 rows=4 width=125) (actual time=0.008..0.008 rows=0.00 loops=2251)
                                          Index Cond: (cus_ent_id = ce_2.id)
                                          Index Searches: 2251
                                          Buffers: shared hit=9004
          ->  Memoize  (cost=0.30..2.01 rows=1 width=139) (actual time=0.000..0.000 rows=0.00 loops=1018)
                Cache Key: cp.free_trial_id
                Cache Mode: logical
                Hits: 1017  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                ->  Index Scan using free_trials_pkey on free_trials ft  (cost=0.29..2.00 rows=1 width=139) (actual time=0.001..0.001 rows=0.00 loops=1)
                      Index Cond: (id = cp.free_trial_id)
                      Index Searches: 0
  ->  Hash Right Join  (cost=7588.29..60169.53 rows=1001 width=609) (actual time=963.572..1070.476 rows=1001.00 loops=1)
        Hash Cond: (cr_1.internal_id = cr.internal_id)
        Buffers: shared hit=294494
        ->  GroupAggregate  (cost=7113.76..59671.22 rows=1001 width=64) (actual time=11.010..116.791 rows=1001.00 loops=1)
              Group Key: cr_1.internal_id
              Buffers: shared hit=29983
              ->  Sort  (cost=7113.76..7128.78 rows=6006 width=569) (actual time=10.758..11.099 rows=1976.00 loops=1)
                    Sort Key: cr_1.internal_id COLLATE "C"
                    Sort Method: quicksort  Memory: 863kB
                    Buffers: shared hit=5023
                    ->  Nested Loop Left Join  (cost=6.58..6736.82 rows=6006 width=569) (actual time=0.040..9.842 rows=1976.00 loops=1)
                          Buffers: shared hit=5023
                          ->  CTE Scan on customer_records cr_1  (cost=0.00..20.02 rows=1001 width=32) (actual time=0.000..0.266 rows=1001.00 loops=1)
                                Storage: Memory  Maximum Storage: 942kB
                          ->  Subquery Scan on ce  (cost=6.58..6.65 rows=6 width=537) (actual time=0.008..0.009 rows=1.92 loops=1001)
                                Buffers: shared hit=5023
                                ->  Limit  (cost=6.58..6.59 rows=6 width=445) (actual time=0.008..0.008 rows=1.92 loops=1001)
                                      Buffers: shared hit=5023
                                      ->  Sort  (cost=6.58..6.59 rows=6 width=445) (actual time=0.007..0.007 rows=1.92 loops=1001)
                                            Sort Key: ce_1.id DESC
                                            Sort Method: quicksort  Memory: 26kB
                                            Buffers: shared hit=5023
                                            ->  Index Scan using idx_customer_entitlements_loose_customer_expires on customer_entitlements ce_1  (cost=0.43..6.50 rows=6 width=445) (actual time=0.005..0.006 rows=1.92 loops=1001)
                                                  Index Cond: (internal_customer_id = cr_1.internal_id)
                                                  Filter: ((expires_at IS NULL) OR (expires_at > (EXTRACT(epoch FROM now()) * '1000'::numeric)))
                                                  Rows Removed by Filter: 0
                                                  Index Searches: 1001
                                                  Buffers: shared hit=5023
              SubPlan 7
                ->  Nested Loop  (cost=0.84..4.29 rows=1 width=32) (actual time=0.013..0.014 rows=1.00 loops=1920)
                      Buffers: shared hit=15360
                      ->  Index Scan using entitlements_pkey on entitlements e_1  (cost=0.43..2.15 rows=1 width=359) (actual time=0.005..0.005 rows=1.00 loops=1920)
                            Index Cond: (id = ce.entitlement_id)
                            Index Searches: 1920
                            Buffers: shared hit=7680
                      ->  Index Scan using features_pkey on features f_1  (cost=0.41..2.13 rows=1 width=349) (actual time=0.002..0.002 rows=1.00 loops=1920)
                            Index Cond: (internal_id = (e_1.internal_feature_id)::text)
                            Index Searches: 1920
                            Buffers: shared hit=7680
              SubPlan 8
                ->  Aggregate  (cost=1.14..1.15 rows=1 width=32) (actual time=0.002..0.003 rows=1.00 loops=1920)
                      Buffers: shared hit=1920
                      ->  Seq Scan on replaceables r_1  (cost=0.00..1.12 rows=2 width=154) (actual time=0.002..0.002 rows=0.00 loops=1920)
                            Filter: (cus_ent_id = ce.id)
                            Rows Removed by Filter: 21
                            Buffers: shared hit=1920
              SubPlan 9
                ->  Aggregate  (cost=3.29..3.30 rows=1 width=32) (actual time=0.008..0.008 rows=1.00 loops=1920)
                      Buffers: shared hit=7680
                      ->  Index Scan using idx_rollovers_cus_ent_id on rollovers ro_1  (cost=0.56..3.23 rows=4 width=125) (actual time=0.007..0.007 rows=0.00 loops=1920)
                            Index Cond: (cus_ent_id = ce.id)
                            Index Searches: 1920
                            Buffers: shared hit=7680
        ->  Hash  (cost=462.02..462.02 rows=1001 width=577) (actual time=952.555..952.567 rows=1001.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 6290kB
              Buffers: shared hit=264511
              ->  Hash Left Join  (cost=436.72..462.02 rows=1001 width=577) (actual time=950.188..951.224 rows=1001.00 loops=1)
                    Hash Cond: (cr.internal_id = cs.internal_customer_id)
                    Buffers: shared hit=264511
                    ->  Hash Left Join  (cost=183.56..206.22 rows=1001 width=545) (actual time=945.881..946.636 rows=1001.00 loops=1)
                          Hash Cond: (cr.internal_id = cpa.internal_customer_id)
                          Buffers: shared hit=263660
                          ->  CTE Scan on customer_records cr  (cost=0.00..20.02 rows=1001 width=513) (actual time=1.618..1.799 rows=1001.00 loops=1)
                                Storage: Memory  Maximum Storage: 942kB
                                Buffers: shared hit=329
                          ->  Hash  (cost=178.66..178.66 rows=392 width=64) (actual time=944.255..944.258 rows=1001.00 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 5348kB
                                Buffers: shared hit=263331
                                ->  Subquery Scan on cpa  (cost=149.82..178.66 rows=392 width=64) (actual time=934.588..943.680 rows=1001.00 loops=1)
                                      Buffers: shared hit=263331
                                      ->  GroupAggregate  (cost=149.82..174.74 rows=392 width=64) (actual time=934.587..943.524 rows=1001.00 loops=1)
                                            Group Key: cpwp.internal_customer_id
                                            Buffers: shared hit=263331
                                            ->  Sort  (cost=149.82..154.83 rows=2002 width=152) (actual time=934.564..934.781 rows=1018.00 loops=1)
                                                  Sort Key: cpwp.internal_customer_id COLLATE "C", cpwp.created_at DESC
                                                  Sort Method: quicksort  Memory: 4806kB
                                                  Buffers: shared hit=263331
                                                  ->  CTE Scan on customer_products_with_prices cpwp  (cost=0.00..40.04 rows=2002 width=152) (actual time=0.374..933.165 rows=1018.00 loops=1)
                                                        Storage: Memory  Maximum Storage: 4739kB
                                                        Buffers: shared hit=263331
                    ->  Hash  (cost=250.66..250.66 rows=200 width=64) (actual time=4.304..4.309 rows=209.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 94kB
                          Buffers: shared hit=851
                          ->  Subquery Scan on cs  (cost=246.16..250.66 rows=200 width=64) (actual time=4.223..4.271 rows=209.00 loops=1)
                                Buffers: shared hit=851
                                ->  HashAggregate  (cost=246.16..248.66 rows=200 width=64) (actual time=4.222..4.253 rows=209.00 loops=1)
                                      Group Key: s.internal_customer_id
                                      Batches: 1  Memory Usage: 288kB
                                      Buffers: shared hit=851
                                      ->  Subquery Scan on s  (cost=190.28..230.92 rows=2032 width=298) (actual time=3.452..3.634 rows=209.00 loops=1)
                                            Buffers: shared hit=851
                                            ->  HashAggregate  (cost=190.28..210.60 rows=2032 width=213) (actual time=3.443..3.532 rows=209.00 loops=1)
                                                  Group Key: cpwp_1.internal_customer_id, s_1.id, s_1.stripe_id, s_1.stripe_schedule_id, s_1.created_at, s_1.usage_features, s_1.metadata, s_1.org_id, s_1.env, s_1.current_period_start, s_1.current_period_end
                                                  Batches: 1  Memory Usage: 161kB
                                                  Buffers: shared hit=851
                                                  ->  Nested Loop  (cost=0.43..134.40 rows=2032 width=213) (actual time=0.038..3.182 rows=210.00 loops=1)
                                                        Buffers: shared hit=851
                                                        ->  Nested Loop  (cost=0.00..80.08 rows=2002 width=64) (actual time=0.013..1.401 rows=215.00 loops=1)
                                                              ->  CTE Scan on customer_products_with_prices cpwp_1  (cost=0.00..40.04 rows=2002 width=64) (actual time=0.001..0.581 rows=1018.00 loops=1)
                                                                    Storage: Memory  Maximum Storage: 4739kB
                                                              ->  Function Scan on unnest cpwp_sub  (cost=0.00..0.01 rows=1 width=32) (actual time=0.000..0.000 rows=0.21 loops=1018)
                                                        ->  Memoize  (cost=0.43..2.15 rows=1 width=181) (actual time=0.008..0.008 rows=0.98 loops=215)
                                                              Cache Key: cpwp_sub.stripe_id
                                                              Cache Mode: logical
                                                              Hits: 1  Misses: 214  Evictions: 0  Overflows: 0  Memory Usage: 58kB
                                                              Buffers: shared hit=851
                                                              ->  Index Scan using idx_subscriptions_stripe_id on subscriptions s_1  (cost=0.42..2.14 rows=1 width=181) (actual time=0.007..0.007 rows=0.98 loops=214)
                                                                    Index Cond: (stripe_id = cpwp_sub.stripe_id)
                                                                    Index Searches: 214
                                                                    Buffers: shared hit=851
Planning:
  Buffers: shared hit=48
Planning Time: 2.770 ms
Execution Time: 1073.464 ms
```
