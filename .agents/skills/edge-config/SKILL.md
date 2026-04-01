---
name: edge-config
description: Understand and create S3-backed edge configs with poll-based caching. Use when adding new runtime configs (feature rollouts, request blocking, operational toggles), debugging edge config polling, or working with the EdgeConfigStore factory.
---

# Edge Configs

Edge configs are JSON files stored in S3 that are polled into server memory at a regular cadence. They let us change server behavior at runtime without deploys -- load shedding, feature rollouts, operational toggles, etc.

## Architecture

Each edge config has its own S3 file under the `admin/` prefix in the admin S3 bucket (`autumn-dev-server` / `autumn-prod-server`). Configs are independent -- a parse error in one does not affect another.

### Key files

| File | Purpose |
|------|---------|
| `server/src/internal/misc/edgeConfig/edgeConfigStore.ts` | `createEdgeConfigStore<T>` factory -- generic S3 read/write, polling, status tracking |
| `server/src/internal/misc/edgeConfig/edgeConfigRegistry.ts` | Registry -- `registerEdgeConfig`, `startAllEdgeConfigPolling`, `stopAllEdgeConfigPolling` |
| `server/src/init.ts` | Calls `startAllEdgeConfigPolling` on boot, `stopAllEdgeConfigPolling` on shutdown |
| `server/src/external/aws/s3/adminS3Config.ts` | Bucket/region resolution (dev vs prod) |

### Existing configs

| Config | S3 Key | Module |
|--------|--------|--------|
| Request blocks | `admin/request-block-config.json` | `server/src/internal/misc/requestBlocks/requestBlockStore.ts` |

## Lifecycle

```
Boot:
  1. Config module is imported (top-level side effect) -> calls registerEdgeConfig()
  2. init.ts calls startAllEdgeConfigPolling({ logger })
  3. Each store: await refresh() (initial S3 fetch, blocks until done)
  4. Each store: setInterval(refresh, pollIntervalMs)
  5. Server starts accepting traffic

Runtime:
  - get() reads from in-memory cache (zero I/O, sync)
  - refresh() runs every pollIntervalMs (fire-and-forget)
  - writeToSource() writes to S3 + updates local cache immediately

Shutdown:
  - stopAllEdgeConfigPolling() clears all intervals
```

## Fail-Open Guarantee

On **any** S3 failure (network error, auth error, bad JSON, schema mismatch), `runtimeConfig` resets to `defaultValue()`. This means:

- No request is ever blocked due to infrastructure failure
- If S3 goes down, configs degrade to their default (empty/safe) state
- The store does NOT hold onto stale data -- it resets to default

`NoSuchKey` (file doesn't exist yet) is treated as a normal empty state, not an error.

## How to Add a New Edge Config

### 1. Define the schema

Create a schemas file with a Zod schema:

```typescript
// server/src/internal/misc/featureRollouts/featureRolloutSchemas.ts
import { z } from "zod/v4";

export const FeatureRolloutConfigSchema = z.object({
  features: z.record(z.string(), z.object({
    percentage: z.number().min(0).max(100).default(0),
    enabled: z.boolean().default(false),
  })).default({}),
});

export type FeatureRolloutConfig = z.infer<typeof FeatureRolloutConfigSchema>;
```

### 2. Create the store module

```typescript
// server/src/internal/misc/featureRollouts/featureRolloutStore.ts
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import {
  type FeatureRolloutConfig,
  FeatureRolloutConfigSchema,
} from "./featureRolloutSchemas.js";

const store = createEdgeConfigStore<FeatureRolloutConfig>({
  s3Key: "admin/feature-rollout-config.json",
  schema: FeatureRolloutConfigSchema,
  defaultValue: () => ({ features: {} }),
  pollIntervalMs: 300_000, // 5 minutes
});

registerEdgeConfig({ store });

export const getFeatureRolloutConfig = () => store.get();

export const isFeatureEnabled = ({
  featureId,
}: {
  featureId: string;
}): boolean => {
  const feature = store.get().features[featureId];
  return feature?.enabled ?? false;
};
```

### 3. Register the import in init.ts

Add a side-effect import so the module runs `registerEdgeConfig` at boot:

```typescript
// server/src/init.ts
import "./internal/misc/featureRollouts/featureRolloutStore.js";
```

### 4. (Optional) Add the S3 key constant

```typescript
// server/src/external/aws/s3/adminS3Config.ts
export const ADMIN_FEATURE_ROLLOUT_CONFIG_KEY = "admin/feature-rollout-config.json";
```

### 5. Use it

```typescript
import { isFeatureEnabled } from "@/internal/misc/featureRollouts/featureRolloutStore.js";

if (isFeatureEnabled({ featureId: "new-billing-engine" })) {
  // new path
}
```

## Factory API Reference

```typescript
const store = createEdgeConfigStore<T>({
  s3Key: string,              // S3 object key under admin bucket
  schema: z.ZodType<T>,       // Zod schema for validation
  defaultValue: () => T,      // Factory for empty/safe default
  pollIntervalMs?: number,    // Poll interval (default: 60_000)
  s3Client?: S3Client,        // Optional DI for testing
});

store.get()                   // T -- in-memory cached config (sync, no I/O)
store.getStatus()             // EdgeConfigStatus -- health/timing info
store.refresh({ logger? })    // Re-fetch from S3, update cache
store.startPolling({ logger? })  // Initial fetch + start interval
store.stopPolling()           // Clear interval
store.readFromSource()        // Direct S3 read (bypasses cache)
store.writeToSource({ config })  // S3 write + update cache immediately
```

## Testing

Unit tests use the `s3Client` DI parameter to inject a mock:

```typescript
const mockClient = { send: jest.fn(async () => ({ Body: ... })) } as unknown as S3Client;

const store = createEdgeConfigStore<MyConfig>({
  s3Key: "admin/test.json",
  schema: MyConfigSchema,
  defaultValue: () => ({ ... }),
  s3Client: mockClient,
});
```

Existing tests: `server/tests/unit/edge-config/edge-config-store.test.ts`
