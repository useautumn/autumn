---
name: rolling-rollouts
description: Build and manage percentage-based rolling rollouts with cache staleness detection. Use when adding new rollout features, debugging rollout bucket routing, working with the rollout edge config, or handling cache staleness during forward/rollback migrations.
---

# Rolling Rollouts

Percentage-based rolling rollout infrastructure for safely migrating infrastructure changes (cache layers, Redis instances, billing engines, etc.) customer-by-customer.

## Architecture

1. **S3 edge config** (`admin/rollout-config.json`) stores rollout definitions with per-org overrides
2. **In-memory polling** via `createEdgeConfigStore` refreshes every 30s (fail-open to empty config)
3. **Deterministic hashing** maps each `customerId` to a bucket 0-99 via `Bun.hash`
4. **Per-request snapshot** on `ctx.rolloutSnapshot` prevents race conditions from mid-request config changes
5. **Cache staleness detection** auto-evicts entries whose routing changed between `previousPercent` and `percent`

### Key files

| File | Purpose |
|------|---------|
| `server/src/internal/misc/rollouts/rolloutSchemas.ts` | Zod schemas: `RolloutPercent`, `RolloutEntry`, `RolloutConfig` |
| `server/src/internal/misc/rollouts/rolloutConfigStore.ts` | Edge config store + `updateRolloutPercent` + `removeRolloutOrg` |
| `server/src/internal/misc/rollouts/rolloutUtils.ts` | `getCustomerBucket`, `isRolloutEnabled`, `isSnapshotCacheStale` |
| `server/src/honoMiddlewares/rolloutMiddleware.ts` | Computes `ctx.rolloutSnapshot` once per request |
| `server/src/honoMiddlewares/utils/resolveCustomerId.ts` | Extracts `customerId` from URL/body/query in `baseMiddleware` |
| `server/src/honoUtils/HonoEnv.ts` | `RolloutSnapshot` and `RolloutSnapshotEntry` types on `RequestContext` |
| `server/src/internal/admin/rollouts/` | Admin CRUD routes for rollout config |
| `vite/src/views/admin/edge-config/EdgeConfigView.tsx` | Admin UI for managing rollouts |

## Config shape

```json
{
  "rollouts": {
    "v2-cache": {
      "percent": 50,
      "previousPercent": 20,
      "changedAt": 1711929600000,
      "orgs": {
        "org_abc": { "percent": 100, "previousPercent": 50, "changedAt": 1711929600000 }
      }
    }
  }
}
```

Each level (global + per-org) stores `percent`, `previousPercent`, `changedAt`. Per-org takes priority over global.

## How to add a new rollout

1. Add a rollout entry to the S3 config (via admin UI at `/admin/edge-config` or `updateRolloutPercent`)
2. At the branch point in your code, read from the snapshot:

```typescript
const snapshot = ctx.rolloutSnapshot?.rollouts["my-rollout"];
if (snapshot?.enabled) {
  // new path
} else {
  // old path
}
```

3. In cache read paths, check for staleness:

```typescript
const snapshot = ctx.rolloutSnapshot?.rollouts["my-rollout"];
if (snapshot && isSnapshotCacheStale({ snapshot, customerBucket: ctx.rolloutSnapshot.customerBucket, cachedAt })) {
  // evict and re-fetch
}
```

## Cache staleness algorithm

When a percentage changes, only customers whose bucket **crossed the boundary** are affected:

```
Example: 20% -> 50%
  bucket 15: was enabled (< 20), still enabled (< 50)    -> NOT stale
  bucket 35: was disabled (>= 20), now enabled (< 50)    -> STALE
  bucket 70: was disabled (>= 20), still disabled (>= 50) -> NOT stale

Example: 50% -> 20% (rollback)
  bucket 15: was enabled (< 50), still enabled (< 20)     -> NOT stale
  bucket 35: was enabled (< 50), now disabled (>= 20)     -> STALE
  bucket 70: was disabled (>= 50), still disabled (>= 20) -> NOT stale
```

The check: `(bucket < previousPercent) !== (bucket < percent)` AND `cachedAt < changedAt`.

Entries without `_cachedAt` (legacy) are conservatively treated as stale if routing changed.

## updateRolloutPercent auto-manages staleness

Always use `updateRolloutPercent` (or the admin UI) to change percentages. It automatically:
- Sets `previousPercent` to the old `percent`
- Sets `changedAt` to `Date.now()`
- Writes to S3 + updates local cache

Never manually edit `previousPercent` or `changedAt`.

## Middleware chain order

```
baseMiddleware (sets ctx.customerId via resolveCustomerId)
  -> auth middleware (sets ctx.org)
    -> rolloutMiddleware (computes ctx.rolloutSnapshot)
      -> handler
```

The rollout middleware must run after auth (needs `ctx.org.id`) and after base (needs `ctx.customerId`).

## Testing rollouts

Use `getCustomerBucket` to find customer IDs in specific bucket ranges:

```typescript
const findCustomerInBucketRange = (min: number, max: number): string => {
  for (let i = 0; i < 10000; i++) {
    const id = `cus_test_${i}`;
    const bucket = getCustomerBucket({ customerId: id });
    if (bucket >= min && bucket < max) return id;
  }
  throw new Error(`No customer found in range [${min}, ${max})`);
};
```

Test staleness scenarios: forward migration, rollback, bump forward, full migration, full rollback, same-percent no-op, legacy entries without `_cachedAt`.
