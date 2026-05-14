# Pagination Benchmark — offset vs cursor — 2026-05-13

## Config

- db host: `aws-us-east-2-2.pg.psdb.cloud:6432`
- env: `live`
- limit: 1000
- repeats per cell: 1
- statement_timeout_ms: 60000
- read_only: true
- shared opts: withSubs=true, includeInvoices=false, withEntities=false, withTrialsUsed=false, cusProductLimit=15
- timings are wall-clock from this laptop around drizzle execute (includes network round-trip + result transfer + deserialize)
- total benchmark wall time: 218.3s

## Scenarios resolved

| # | Org | Filter | Filtered count | Deep offset | Deep cursor |
|---|-----|--------|----------------|-------------|-------------|
| 01-baseline | firecrawl | `none (baseline)` | 1,225,211 | 950,000 | `{ t: 1774210364093, id: 5ee7a1eb… }` |
| 02-search-gmail | firecrawl | `search '@gmail'` | 184,264 | 82,918 | `{ t: 1776593058654, id: c0e7d692… }` |
| 03-status-active | firecrawl | `inStatuses=['active']` | 1,225,211 | 551,344 | `{ t: 1774237999733, id: 95fdf38e… }` |
| 04-plan-massive | firecrawl | `plans=['free']` | 1,206,690 | 543,010 | `{ t: 1774238574871, id: 281784e4… }` |
| 05-plan-mid | firecrawl | `plans=['hobby']` | 27,421 | 12,339 | `{ t: 1774200253978, id: 5845392c… }` |
| 06-plan-rare | firecrawl | `plans=['scale_monthly']` | 204 | — | — |
| 07-processor-stripe | firecrawl | `processors=['stripe']` | 38,933 | 17,519 | `{ t: 1773503945904, id: 7e4ae8d2… }` |
| 08-internal-ids | firecrawl | `internalCustomerIds=[10]` | 10 | — | — |
| 09-processor-revenuecat | runable | `processors=['revenuecat']` | 1,274 | — | — |

## Results

| # | Org | Filter | Depth | offset median ms | cursor median ms | Δ ms | offset p95 | cursor p95 | offset rows | cursor rows | offset error | cursor error |
|---|-----|--------|-------|------------------|------------------|------|------------|------------|-------------|-------------|--------------|--------------|
| 01-baseline | firecrawl | `none (baseline)` | page1 | 3440 | 3393 | -47 | 3440 | 3393 | 1000 | 1001 |  |  |
| 01-baseline | firecrawl | `none (baseline)` | deep | 4126 | 2956 | -1169 | 4126 | 2956 | 1000 | 1001 |  |  |
| 02-search-gmail | firecrawl | `search '@gmail'` | page1 | 2924 | 2964 | +41 | 2924 | 2964 | 1000 | 1001 |  |  |
| 02-search-gmail | firecrawl | `search '@gmail'` | deep | 3393 | 3751 | +358 | 3393 | 3751 | 1000 | 1001 |  |  |
| 03-status-active | firecrawl | `inStatuses=['active']` | page1 | 3939 | 4185 | +246 | 3939 | 4185 | 1000 | 1001 |  |  |
| 03-status-active | firecrawl | `inStatuses=['active']` | deep | 7306 | 3746 | -3560 | 7306 | 3746 | 1000 | 1001 |  |  |
| 04-plan-massive | firecrawl | `plans=['free']` | page1 | 2676 | 2903 | +227 | 2676 | 2903 | 1000 | 1001 |  |  |
| 04-plan-massive | firecrawl | `plans=['free']` | deep | 36372 | 1784 | -34588 | 36372 | 1784 | 1000 | 1001 |  |  |
| 05-plan-mid | firecrawl | `plans=['hobby']` | page1 | 5539 | 7062 | +1523 | 5539 | 7062 | 1000 | 1001 |  |  |
| 05-plan-mid | firecrawl | `plans=['hobby']` | deep | 38772 | 4632 | -34140 | 38772 | 4632 | 1000 | 1001 |  |  |
| 06-plan-rare | firecrawl | `plans=['scale_monthly']` | page1 | 899 | 877 | -23 | 899 | 877 | 139 | 139 |  |  |
| 07-processor-stripe | firecrawl | `processors=['stripe']` | page1 | 2850 | 3017 | +167 | 2850 | 3017 | 1000 | 1001 |  |  |
| 07-processor-stripe | firecrawl | `processors=['stripe']` | deep | 8627 | 4797 | -3829 | 8627 | 4797 | 1000 | 1001 |  |  |
| 08-internal-ids | firecrawl | `internalCustomerIds=[10]` | page1 | 467 | 472 | +5 | 467 | 472 | 10 | 10 |  |  |
| 09-processor-revenuecat | runable | `processors=['revenuecat']` | page1 | 6261 | 5212 | -1049 | 6261 | 5212 | 1000 | 1001 |  |  |

## Raw samples (per cell)

### 01-baseline / page1
- offset: [3440]ms
- cursor: [3393]ms

### 01-baseline / deep
- offset: [4126]ms
- cursor: [2956]ms

### 02-search-gmail / page1
- offset: [2924]ms
- cursor: [2964]ms

### 02-search-gmail / deep
- offset: [3393]ms
- cursor: [3751]ms

### 03-status-active / page1
- offset: [3939]ms
- cursor: [4185]ms

### 03-status-active / deep
- offset: [7306]ms
- cursor: [3746]ms

### 04-plan-massive / page1
- offset: [2676]ms
- cursor: [2903]ms

### 04-plan-massive / deep
- offset: [36372]ms
- cursor: [1784]ms

### 05-plan-mid / page1
- offset: [5539]ms
- cursor: [7062]ms

### 05-plan-mid / deep
- offset: [38772]ms
- cursor: [4632]ms

### 06-plan-rare / page1
- offset: [899]ms
- cursor: [877]ms

### 07-processor-stripe / page1
- offset: [2850]ms
- cursor: [3017]ms

### 07-processor-stripe / deep
- offset: [8627]ms
- cursor: [4797]ms

### 08-internal-ids / page1
- offset: [467]ms
- cursor: [472]ms

### 09-processor-revenuecat / page1
- offset: [6261]ms
- cursor: [5212]ms
