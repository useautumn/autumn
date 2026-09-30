---
author: john + claude
feature: customer-cache
date: 2026-09-29
status: superseded by design/byoc-service.md
---

# The cache entry: a check document, not an API object

We store what the engine draws from, compiled, and the SDK runs the draw. We never store the API
object (versions and missing inputs) and never a finished headroom (properties, tiers and the
entity + customer composition can't be precomputed).

```
 herald (on each record)                     customer's app (hot path)
 ─────────────────────                       ─────────────────────────
 worker state + catalog                      read c1.cus.X  ┐ parallel
   │ compileCheckDocument                    read c1.ent.X.E┘ (+ rate
   ▼                                           │    schemas, memoised)
 c1.cus.X   pools · draw order · caps · spend  ▼
 c1.ent.X.E pools · draw order · caps · spend  evaluate(F, N, props, now)
 c1.rate.<hash>  one credit schema, immutable    → allowed | ask API
```

## What a key holds

```jsonc
// c1.cus.cus_123
{ "v": 1, "offset": "8812731", "at": 1790700000000,
  "customer_id": "cus_123",
  "plans": [{ "id": "pro", "status": "active" }],
  "flags": ["sso"],
  "pools": {
    "p1": { "feature": "messages", "balance": 400, "granted": 500,
            "overage": null, "resets_at": 1793000000000 },
    "p2": { "feature": "credits", "balance": 40, "granted": 1000,
            "overage": { "max": 100 }, "schema": "r_9f2c",
            "tiers_used": { "": 9950, "large": 120 },
            "rollovers": [{ "balance": 20, "expires_at": 1792000000000 }] } },
  "draw":  { "messages": ["p1"], "gpt4_tokens": ["p2"] },
  "caps":  [{ "feature": "gpt4_tokens", "counts": "units", "limit": 1000,
              "used": 900, "filter": { "model": "gpt-4" },
              "ends_at": 1791000000000 }],
  "spend": { "credits": { "limit": 50 } },
  "overage_allowed": {},
  "valid_until": { "messages": 1793000000000 } }

// c1.ent.cus_123.user_7 — same shape, only user_7's own rows and caps
{ "v": 1, "offset": "8812740", "entity_id": "user_7",
  "shares_customer": true,
  "pools": { "e1": { "feature": "messages", "balance": 20, "granted": 50,
                     "overage": null } },
  "draw":  { "messages": ["e1"] },
  "caps":  [{ "feature": "messages", "counts": "units", "limit": 100,
              "used": 90, "ends_at": 1791000000000 }] }
```

- A **pool** is one balance the engine draws: a row, or one entity's slice of a per-entity row.
  A credit pool appears once however many features it funds.
- **`draw`** is each feature's pools in the engine's sort order, compiled at write
  (`sortCusEntsForDeduction.ts`). It's the only per-feature routing.
- **`caps`** are meters: the customer key holds the effective customer-scope cap (its own, else
  the strictest plan's); the entity key holds only the entity's own.
- **`c1.rate.<hash>`** is one credit schema (base rate or tiers, dimensions, multipliers),
  content-addressed and never rewritten. A plan-item override is just a different hash.

## How the SDK answers, entity + customer

```
evaluate(F, N, props, now):
  N ≤ 0                         → allowed
  now ≥ valid_until[F]          → ask API   (a lazy reset is due)
  F in flags                    → allowed
  pools = E.draw[F] ++ (shares_customer ? C.draw[F] : [])
  none                          → refused, feature_not_attached
  any pool unlimited            → allowed, caps off
  caps  = matching filters; per (feature, filter) E's cap replaces C's
  spend = E.spend[f] ?? C.spend[f], used = overage across these pools
  draw N: rollovers (by expiry) → included → overage, each draw
          priced by the pool's schema + props + tiers_used,
          capped by min cap headroom and the pool's floor
  nothing left → allowed, else refused with the binding limit
```

The loop is a port of `deduct.ts`; balance reads (`remaining`, `granted`, `usage`, cap
headroom) come from the same pools, so the check and the number shown can't disagree.

## Versioning, so customers never migrate a cache

1. **Major in the key** (`c1.`). A breaking change means herald writes `c2.` beside `c1.` for a
   deprecation window; each SDK reads the highest it knows.
2. **Additive within a major.** Readers ignore unknown fields.
3. **New meaning is opt-in per feature.** A feature carries `requires: ["x"]` when ignoring x
   would change the answer; an SDK without x answers that feature through the API. Never wrong,
   only slower.
4. **The document is not an API response.** The SDK renders whichever API version it speaks.

## How each input is handled

| input | where |
|---|---|
| flags, unlimited, `max_purchase` floor, statuses, past-due block, `disable_pooled_balance` | compiled |
| entity caps vs customer caps (carve-out per feature + filter), filters | evaluated |
| spend limit precedence and headroom; `overage_allowed` control over native overage | evaluated |
| dimensions, multipliers, graduated tiers, zero rate = 1 | evaluated from `c1.rate` |
| rollover / grant expiry, usage window end (counter reads 0) | evaluated at `now` |
| lazy reset due | `valid_until` → API, whose reset writes a record → herald re-pushes |
| locks | already in balances |
| other entities drawing shared rows | customer key re-pushed on every such record |
| customer draw across many entities' slices | herald re-pushes the entities it touched |
| `send_event`, `lock`, `with_preview`, AI token pricing, unknown feature, missing or oversized key | API |

## How we know it matches the engine

`packages/check-document` holds `compile` (herald) and `evaluate` (SDK), pure TS. A property
test generates subject states (entities, map rows, pools, credits with tiers and dimensions,
caps, spend limits, rollovers, times) and asserts `evaluate(compile(state))` equals the engine's
check for random `N`, `props` and `now`. Every engine unit fixture runs through it too. An edge
case we didn't list fails the test instead of a customer.

## Decided (John, 2026-09-29)

- Eventually consistent: a local check may miss usage from the last push window.
- The SDK subtracts its own tracks: each track's deltas sit in a process-local overlay until an
  entry with an offset at or past that track's record lands. Open: the track reply must carry
  its record's offset (else a time-based expiry).
- Per-entity balances (the `entities` map rows) are deprecated and out of scope: a feature drawing
  one is answered through the API.

## Open

1. Non-TS SDKs: port `evaluate` per language, or compile it to WASM once.
2. Size: alien caps a value at 24 KiB; a customer with hundreds of rows passes it. Merge pools
   that behave identically, else `oversized` → API.
