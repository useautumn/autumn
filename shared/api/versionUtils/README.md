# API Versioning System

Stripe-inspired versioning with CalVer (external) and SemVer (internal).

## Core Concept

**Always build latest format → Transform backwards automatically**

```typescript
// Your handler
const latestData = { features: { f1: {...} } };  // V1_2 format

return applyVersionChanges({
  data: latestData,
  currentVersion: new ApiVersionClass(LATEST_VERSION),
  targetVersion: ctx.apiVersion,  // From middleware
  resource: AffectedResource.Customer
});
```

## Quick Reference

### Version Comparison
```typescript
// ctx.apiVersion ready in middleware
if (ctx.apiVersion.gte(ApiVersion.V1_1)) { ... }
if (ctx.apiVersion.lt(ApiVersion.V1_2)) { ... }
```

### Version Mapping

| SemVer | CalVer | Legacy v1 | Legacy v2 |
|--------|--------|-----------|-----------|
| V1_4   | 2025-06-01 | - | 1.4 (beta) |
| V1_2   | 2025-05-05 | - | 1.2 |
| V1_1   | 2025-04-17 | - | 1.1 |
| V0_2   | 2025-04-01 | 0.2 | 1.0 |
| V0_1   | 2025-02-01 | 0.1 | - |

### Side Effects
```typescript
if (ctx.apiVersion.lt(ApiVersion.V1_1)) {
  expandArray.push(CusExpand.Invoices);
}
```

## How Transforms Work

1. **User requests V1_1**, your data is V1_2:
   ```
   V1_2 { features: { f1: {...} } }
      ↓ FeaturesArrayToObject.transform()
   V1_1 { features: [{ feature_id: 'f1', ...}] }
   ```

2. **Multiple versions back** (V1_2 → V0_2):
   ```
   V1_2 → V1_1 → V0_2
   (Each transform applied in sequence)
   ```

## File Structure

```
shared/api/
├── versionUtils/
│   ├── ApiVersion.ts              # Version enum
│   ├── ApiVersionClass.ts         # Comparison methods
│   ├── versionRegistry.ts         # SemVer ↔ CalVer mappings
│   ├── versionRegistryUtils.ts    # Helper functions
│   ├── convertVersionUtils.ts     # Conversion utils
│   ├── versionBranchUtils.ts      # Branching helpers
│   └── versionChangeUtils/
│       ├── VersionChange.ts              # Abstract base
│       ├── VersionChangeRegistryClass.ts # Registry class
│       ├── versionChangeRegistry.ts      # Register all changes
│       └── applyVersionChanges.ts        # Transform engine
└── customers/
    └── changes/                   # Customer-specific changes
        ├── V1_2_FeaturesArrayToObject.ts
        ├── V1_1_MergedResponse.ts
        ├── V1_1_LegacyExpandInvoices.ts  # Side effect
        └── V0_2_ProductItems.ts
```

### Change Organization

**Version changes live with the resource they affect:**
- Customer changes → `shared/api/customers/changes/`
- Product changes → `shared/api/products/changes/`
- Invoice changes → `shared/api/invoices/changes/`

**Naming convention:** `V{version}_{Description}.ts`
- `V1_2_FeaturesArrayToObject.ts`
- `V1_1_MergedResponse.ts`

## Creating Version Changes

### 1. Create Change Class

```typescript
// shared/api/customers/changes/V1_3_MyChange.ts
import { ApiVersion, VersionChange, AffectedResource } from "@autumn/shared";

export class V1_3_MyChange extends VersionChange {
  readonly version = ApiVersion.V1_3;
  readonly description = "Brief description";
  readonly affectedResources = [AffectedResource.Customer];

  transform({ data }: { data: any }): any {
    // Transform FROM V1_3 TO V1_2
    return { ...data, oldField: data.newField };
  }
}
```

### 2. Register in Registry

```typescript
// versionChangeUtils/versionChangeRegistry.ts
export const V1_3_CHANGES = [
  V1_3_MyChange,
  V1_3_AnotherChange,
];

export function registerAllVersionChanges() {
  VersionChangeRegistryClass.register({
    version: ApiVersion.V1_3,
    changes: V1_3_CHANGES
  });
  // ... other versions
}
```

### Side Effect Changes

```typescript
export class V1_3_MySideEffect extends VersionChange {
  readonly hasSideEffects = true;  // Mark as side effect
  // ... rest
}

// In handler:
if (ctx.apiVersion.lt(ApiVersion.V1_3)) {
  // Handle side effect logic
}
```

## CalVer with .clover Support

System supports `.clover` suffix for non-breaking changes:
- `2025-04-17` → Breaking change
- `2025-04-17.clover` → Non-breaking update (future use)

Both map to same SemVer internally.

## Usage Patterns

### Standard Handler

```typescript
export const handleGet = createRoute({
  handler: async (c) => {
    const ctx = c.get("ctx");

    // Build latest
    const data = buildLatest();

    // Transform
    return c.json(applyVersionChanges({
      data,
      currentVersion: new ApiVersionClass(LATEST_VERSION),
      targetVersion: ctx.apiVersion,
      resource: AffectedResource.Customer
    }));
  }
});
```

### With Version Logic

```typescript
// Check version
if (ctx.apiVersion.lt(ApiVersion.V1_1)) {
  expandArray.push(CusExpand.Invoices);
}

// Use helper
const withItems = ctx.apiVersion.gte(ApiVersion.V0_2);
```

## Middleware

`apiVersionMiddleware` resolves version from:
1. `x-api-version` header (CalVer: "2025-04-17")
2. `org.api_version` (legacy: 1.1)
3. `org.config.api_version` (legacy: 0.2)
4. Default: V0_2

Result stored in `ctx.apiVersion` (ApiVersionClass).

## Migration from Old System

### Before
```typescript
const apiVersion = orgToVersion({ org, reqApiVersion });
if (apiVersion >= LegacyVersion.v1_1) { ... }
```

### After
```typescript
if (ctx.apiVersion.gte(ApiVersion.V1_1)) { ... }
```

## Key Principles

1. **Always build latest** - Let transforms handle old versions
2. **Transforms go backwards** - New → Old, never Old → New
3. **Object parameters** - All functions use `{ param }` signature
4. **Descending order** - Version lists newest first
5. **Resource organization** - Changes live with affected resources
