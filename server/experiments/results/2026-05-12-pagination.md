# Pagination Benchmark — 2026-05-12

## Config

- org_id: `org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt`
- env: `sandbox`
- base limit: `50`
- deep offset: `95000`
- deep cursor: `{ t: 1715891201011, id: cus_bench_00005637 }`
- search term: `Customer 50000`
- repeats per cell: 10

## Results

| # | Cell | Rows | median ms | p95 ms | min ms | max ms |
|---|------|------|-----------|--------|--------|--------|
| 01 | offset / no filter / page 0 / limit 50 | 50 | 8.38 | 9.93 | 6.83 | 9.93 |
| 02 | offset / no filter / page 0 / limit 50 + total_count | 1 | 23.10 | 24.72 | 21.36 | 24.72 |
| 03 | offset / no filter / deep (offset 95000) / limit 50 | 50 | 30.60 | 33.61 | 29.01 | 33.61 |
| 04 | offset / search "Customer 50000" / deep (offset 95000) / limit 50 | 0 | 176.28 | 205.53 | 166.42 | 205.53 |
| 05 | offset / search count / "Customer 50000" | 1 | 173.95 | 183.80 | 167.27 | 183.80 |
| 06 | offset / revenuecat=true / page 0 / limit 50 | 50 | 8.49 | 9.06 | 7.59 | 9.06 |
| 07 | cursor / no filter / first page / limit 50 | 51 | 7.89 | 8.23 | 7.63 | 8.23 |
| 08 | cursor / no filter / deep (via constructed cursor) / limit 50 | 51 | 7.96 | 10.06 | 7.76 | 10.06 |
| 09 | cursor / search "Customer 50000" / deep / limit 50 | 0 | 16.82 | 18.31 | 16.24 | 18.31 |
| 10 | cursor / revenuecat=true / first page / limit 50 | 51 | 8.24 | 9.58 | 6.57 | 9.58 |
| 11 | offset / no filter / page 0 / limit 1000 | 1000 | 21.37 | 25.70 | 19.67 | 25.70 |
| 12 | offset / no filter / deep / limit 1000 | 1000 | 40.02 | 43.46 | 37.42 | 43.46 |
| 13 | cursor / no filter / first page / limit 1000 | 1001 | 16.97 | 18.61 | 15.74 | 18.61 |
| 14 | cursor / no filter / deep / limit 1000 | 1001 | 14.74 | 18.50 | 14.13 | 18.50 |

## EXPLAIN ANALYZE

### 01 offset / no filter / page 0 / limit 50

```
Limit  (cost=0.42..3.74 rows=50 width=105) (actual time=0.017..0.037 rows=50 loops=1)
  Buffers: shared hit=45
  ->  Index Scan using idx_customers_org_id_env_created_at on customers c  (cost=0.42..6209.82 rows=93365 width=105) (actual time=0.016..0.033 rows=50 loops=1)
        Index Cond: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text))
        Buffers: shared hit=45
Planning Time: 0.080 ms
Execution Time: 0.079 ms
```

### 02 offset / no filter / page 0 / limit 50 + total_count

```
Aggregate  (cost=4391.50..4391.52 rows=1 width=4) (actual time=19.979..19.980 rows=1 loops=1)
  Buffers: shared hit=2468 read=160
  ->  Seq Scan on customers c  (cost=0.00..4158.09 rows=93365 width=0) (actual time=0.006..15.661 rows=100619 loops=1)
        Filter: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text))
        Rows Removed by Filter: 3475
        Buffers: shared hit=2468 read=160
Planning Time: 0.087 ms
Execution Time: 20.023 ms
```

### 03 offset / no filter / deep (offset 95000) / limit 50

```
Limit  (cost=6209.82..6209.88 rows=1 width=105) (actual time=25.752..25.768 rows=50 loops=1)
  Buffers: shared hit=38099
  ->  Index Scan using idx_customers_org_id_env_created_at on customers c  (cost=0.42..6209.82 rows=93365 width=105) (actual time=0.018..23.191 rows=95050 loops=1)
        Index Cond: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text))
        Buffers: shared hit=38099
Planning Time: 0.103 ms
Execution Time: 25.826 ms
```

### 04 offset / search "Customer 50000" / deep (offset 95000) / limit 50

```
Limit  (cost=4923.88..4923.88 rows=1 width=105) (actual time=168.954..168.956 rows=0 loops=1)
  Buffers: shared hit=2628
  ->  Sort  (cost=4923.81..4923.88 rows=28 width=105) (actual time=168.952..168.953 rows=1 loops=1)
        Sort Key: created_at DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=2628
        ->  Seq Scan on customers c  (cost=0.00..4923.14 rows=28 width=105) (actual time=82.227..168.945 rows=1 loops=1)
              Filter: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text) AND ((id ~~* '%Customer 50000%'::text) OR (name ~~* '%Customer 50000%'::text) OR (email ~~* '%Customer 50000%'::text)))
              Rows Removed by Filter: 104093
              Buffers: shared hit=2628
Planning Time: 0.279 ms
Execution Time: 169.025 ms
```

### 05 offset / search count / "Customer 50000"

```
Aggregate  (cost=4923.20..4923.22 rows=1 width=4) (actual time=161.501..161.502 rows=1 loops=1)
  Buffers: shared hit=2628
  ->  Seq Scan on customers c  (cost=0.00..4923.14 rows=28 width=0) (actual time=82.466..161.495 rows=1 loops=1)
        Filter: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text) AND ((id ~~* '%Customer 50000%'::text) OR (name ~~* '%Customer 50000%'::text) OR (email ~~* '%Customer 50000%'::text)))
        Rows Removed by Filter: 104093
        Buffers: shared hit=2628
Planning Time: 0.267 ms
Execution Time: 161.591 ms
```

### 06 offset / revenuecat=true / page 0 / limit 50

```
Limit  (cost=0.42..37.76 rows=50 width=64) (actual time=0.206..0.354 rows=50 loops=1)
  Buffers: shared hit=696
  ->  Index Scan using idx_customers_org_id_env_created_at on customers c  (cost=0.42..6443.23 rows=8627 width=64) (actual time=0.206..0.350 rows=50 loops=1)
        Index Cond: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text))
        Filter: ((processors ->> 'revenuecat'::text) IS NOT NULL)
        Rows Removed by Filter: 1062
        Buffers: shared hit=696
Planning Time: 0.080 ms
Execution Time: 0.388 ms
```

### 07 cursor / no filter / first page / limit 50

```
Limit  (cost=0.42..4.08 rows=51 width=105) (actual time=0.013..0.032 rows=51 loops=1)
  Buffers: shared hit=46
  ->  Index Scan using idx_customers_cursor on customers c  (cost=0.42..6703.72 rows=93365 width=105) (actual time=0.012..0.029 rows=51 loops=1)
        Index Cond: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text))
        Buffers: shared hit=46
Planning Time: 0.076 ms
Execution Time: 0.066 ms
```

### 08 cursor / no filter / deep (via constructed cursor) / limit 50

```
Limit  (cost=0.42..9.41 rows=51 width=105) (actual time=0.011..0.031 rows=51 loops=1)
  Buffers: shared hit=32
  ->  Index Scan using idx_customers_cursor on customers c  (cost=0.42..2107.49 rows=11952 width=105) (actual time=0.011..0.028 rows=51 loops=1)
        Index Cond: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text) AND (ROW(created_at, id) < ROW('1715891201011'::numeric, 'cus_bench_00005637'::text)))
        Buffers: shared hit=32
Planning Time: 0.076 ms
Execution Time: 0.062 ms
```

### 09 cursor / search "Customer 50000" / deep / limit 50

```
Limit  (cost=0.42..2197.13 rows=4 width=105) (actual time=9.838..9.839 rows=0 loops=1)
  Buffers: shared hit=2298
  ->  Index Scan using idx_customers_cursor on customers c  (cost=0.42..2197.13 rows=4 width=105) (actual time=9.837..9.837 rows=0 loops=1)
        Index Cond: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text) AND (ROW(created_at, id) < ROW('1715891201011'::numeric, 'cus_bench_00005637'::text)))
        Filter: ((id ~~* '%Customer 50000%'::text) OR (name ~~* '%Customer 50000%'::text) OR (email ~~* '%Customer 50000%'::text))
        Rows Removed by Filter: 5618
        Buffers: shared hit=2298
Planning Time: 0.272 ms
Execution Time: 9.880 ms
```

### 10 cursor / revenuecat=true / first page / limit 50

```
Limit  (cost=0.42..41.43 rows=51 width=64) (actual time=0.184..0.320 rows=51 loops=1)
  Buffers: shared hit=701
  ->  Index Scan using idx_customers_cursor on customers c  (cost=0.42..6937.13 rows=8627 width=64) (actual time=0.183..0.316 rows=51 loops=1)
        Index Cond: ((org_id = 'org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt'::text) AND (env = 'sandbox'::text))
        Filter: ((processors ->> 'revenuecat'::text) IS NOT NULL)
        Rows Removed by Filter: 1074
        Buffers: shared hit=701
Planning Time: 0.070 ms
Execution Time: 0.352 ms
```
