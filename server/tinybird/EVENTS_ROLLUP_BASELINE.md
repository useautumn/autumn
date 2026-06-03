# events.aggregate — pre-rollup baseline

Captured **2026-06-03**, for the `events_hourly_rollup_mv` change (branch `feat/events-hourly-rollup`).
Re-run the staging harness after deploying the rollup + flipping `aggregate_groupable` routing, and diff against these numbers.

## Exact prod meltdown shapes (firecrawl — from Axiom `req.body`, 2026-06-03 13:30–13:55 UTC)

**Main shape — 311 timeout rows** (the primary target of the customer-leading rollup key):
```json
{ "range": "90d", "bin_size": "day",
  "customer_id": "657b2c34-9799-4d70-8f4a-c5de1b11d922",
  "entity_id":   "7ee3837e-7464-4840-8880-b9f0b52e2635",
  "feature_id":  "CREDITS",
  "group_by":    "properties.apiKeyId" }
```
Per-customer + per-entity, grouped by `apiKeyId`, 90d.

**Secondary — 14 rows:** custom_range ~5 months (start `1767187837333` ≈ 2026-01-01, end `1780493437333` ≈ 2026-06-03), per-customer+entity, ungrouped.
**`/query/raw` failures:** per-customer, `interval` 7d (plus one each 30d / 90d).

## PROD baseline (us-east · `api.useautumn.com` → direct ALB, no CDN)
Axiom `express`, `/v1/events.aggregate` for firecrawl, last 7d:
- 247,243 calls · p50 442ms · **p95 96.4s · p99 124.9s · max 310s**
- timeouts >60s: **37,399 (15%)** · errors (non-200): **77,386 (31%)**
- **New + worsening** — healthy through May 31 (p99 1–7s, 0 timeouts); cliff on Jun 1 (~2–3× volume):
  - Jun 1 — 68,009 calls · p50 724ms · p99 124.9s · 9,858 timeouts
  - Jun 2 — 54,344 · p50 **8.96s** · p99 174.7s · 16,478 timeouts
  - Jun 3 (partial) — 33,904 · p50 **19.8s** · p99 181.7s · 11,063 timeouts
- Prod has no CloudFront, so true response times run to 310s.

## STAGING baseline (us-west · `api-staging.useautumn.com` → us-west prod Tinybird · env=live)
Measured directly 2026-06-03 via `POST /v1/events.aggregate`.

> **Topology note:** staging IS behind **CloudFront** (60s origin-response cap) → slow queries return **HTTP 504 at ~60s**; true time above 60s is masked (unlike prod's direct ALB).
> **Per-customer shapes 404** ("customer_not_found") — staging Postgres lacks firecrawl's prod customer record, though the *events* are fully present in us-west Tinybird. Baseline therefore uses the **org-wide (`aggregateAll`)** shape: a *harder* (no customer prune) proxy for the same pipe + `apiKeyId` JSON-extraction cost.

| shape | range | HTTP | time |
|---|---|---|---|
| org-wide, group by `apiKeyId` | 7d | 200 | **9.7s** |
| org-wide, group by `apiKeyId` | 90d | 504 | **>60s (timeout)** |
| ungrouped (`aggregate_simple`) | 30d | 200 | **18.9s** |
| per-customer + entity, group by `apiKeyId` | 24h / 7d / 30d / 90d | 404 | n/a |

Bodies are real (org-wide returns the per-apiKeyId breakdown; ungrouped returns ~18–54M CREDITS/day, matching prod volume).

## After-rollup targets (re-run the same staging harness)
- org-wide group-by-`apiKeyId` 7d: **9.7s → <1–2s**
- org-wide group-by-`apiKeyId` 90d: **504/timeout → 200 in <2s**
- ungrouped 30d: **18.9s → <2s** (after the `getCountAndSum` fix + serving count/sum from the rollup)

## Re-run harness
`POST https://api-staging.useautumn.com/v1/events.aggregate`, header `Authorization: Bearer <staging firecrawl secret key>`, bodies as above, swept over `range` ∈ {24h, 7d, 30d, 90d}. (Key intentionally not stored here.)

## Phase B trial — engine-level baseline (us-west `autumn_us_west_prod`, 2026-06-03)
Firecrawl org_id = `biu9vSF7vghBLSKW1UTDwxHBAivjnPaK`.

**Latency (before), via `tb sql`:** firecrawl 7d (2026-05-27 → 2026-06-03) `apiKeyId` group-by on raw `events` → **TIMED OUT at 60,243ms (>60s)**. (Endpoint path via `events_hourly_mv` was ~9.7s in the API harness.) After-target: same query on `events_property_mv` → sub-second.

**Storage (before), `tb datasource ls`:**
- `events` (raw): 3,848,845,710 rows / 115.72 GB
- `events_by_timestamp_mv`: 3,851,205,642 / 139.76 GB
- **`events_hourly_mv` (full-properties bomb — retire target): 2,417,035,992 / 34.8 GB**
- `events_hourly_no_props_mv` (dup, retire): 495,481,050 / 2.3 GB
- `events_hourly_no_properties_mv` (dup, retire): 295,481,986 / 1.79 GB
- `events_hourly_no_properties_two_mv` (KEEP): 289,450,781 / 1.76 GB
- `events_hourly_rollup_mv` (tactical apiKeyId, ~2d backfilled): 716,285 / 6.95 MB
- `events_property_mv` (generic, forward-only pre-backfill): 90,339 / 821 KB

**Net-storage finding:** the generic `events_property_mv` is MB-scale; retiring `events_hourly_mv` (34.8 GB) + the two duplicate no-props MVs (~4.1 GB) reclaims ~39 GB. The design **reduces** storage. Also confirms `ARRAY JOIN JSONExtractKeysAndValues` works in a Forward MV (90K forward rows materialized).
