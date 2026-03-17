---
name: api-versioning
description: Create and maintain API version changes. Use when adding breaking changes to API responses/requests, creating version change files, transforming data between versions, or handling backward compatibility.
---

# API Versioning

Create version change files that transform API data between versions.

## Core Concept

**Always build latest format, transform backwards automatically.**

```
User on V1.2 ← transformResponse ← Latest (V2.0)
User on V1.2 → transformRequest  → Latest (V2.0)
```

- **Response transforms**: Go BACKWARDS (new → old). User expects old format.
- **Request transforms**: Go FORWARDS (old → new). Handler expects latest format.

## Version Flow

```
V2.0 (latest)
  ↓ V1_2_CustomerChange.transformResponse()
V1_Beta
  ↓ V1_1_FeaturesArrayToObject.transformResponse()
V1.2
  ↓ V0_2_CustomerChange.transformResponse()
V1.1
  ↓ ...
V0.1
```

Each change file is a **single-step mapping** from one version to the previous.

## Quick Reference

| File Location | Purpose |
|--------------|---------|
| `shared/api/{resource}/changes/V{X}_{Y}_{Name}.ts` | Response transforms (top-level resources) |
| `shared/api/{resource}/requestChanges/V{X}_{Y}_{Name}.ts` | Request transforms |
| `shared/api/{resource}/previousVersions/` | Old schema definitions |
| `shared/api/versionUtils/versionChangeRegistry.ts` | Register all changes |

## Creating a Version Change

### Step 1: Define Schemas

Create/identify both schemas in `shared/api/{resource}/`:

```typescript
// Latest schema (shared/api/customers/apiCustomer.ts)
export const ApiCustomerSchema = z.object({
  subscriptions: z.array(ApiSubscriptionSchema),  // V2.0: renamed from "products"
  balances: z.record(ApiBalanceSchema),           // V2.0: renamed from "features"
});

// Old schema (shared/api/customers/previousVersions/apiCustomerV3.ts)
export const ApiCustomerV3Schema = z.object({
  products: z.array(ApiCusProductV3Schema),  // V1.2 name
  features: z.record(ApiCusFeatureV3Schema), // V1.2 name
});
```

### Step 2: Create the Change File

File: `shared/api/customers/changes/V1.2_CustomerChange.ts`

```typescript
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
  AffectedResource,
  defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { ApiCustomerSchema } from "../apiCustomer.js";
import { ApiCustomerV3Schema } from "../previousVersions/apiCustomerV3.js";

export const V1_2_CustomerChange = defineVersionChange({
  newVersion: ApiVersion.V2_0,    // Version where breaking change was introduced
  oldVersion: ApiVersion.V1_Beta, // Version we're transforming TO
  description: [
    "Products renamed to subscriptions",
    "Features renamed to balances",
  ],
  affectedResources: [AffectedResource.Customer],
  newSchema: ApiCustomerSchema,
  oldSchema: ApiCustomerV3Schema,

  // Response: V2.0 → V1.2 (transform TO older format)
  transformResponse: ({ input, legacyData, ctx }) => {
    return {
      ...input,
      products: input.subscriptions.map(sub => 
        transformSubscriptionToCusProductV3({ input: sub, ctx })
      ),
      features: Object.fromEntries(
        Object.entries(input.balances).map(([id, bal]) => [
          id, 
          transformBalanceToCusFeatureV3({ input: bal })
        ])
      ),
    };
  },
});
```

### Step 3: Register the Change

File: `shared/api/versionUtils/versionChangeUtils/versionChangeRegistry.ts`

```typescript
import { V1_2_CustomerChange } from "@api/customers/changes/V1.2_CustomerChange.js";

export const V2_CHANGES: VersionChangeConstructor[] = [
  V1_2_CustomerChange,  // Registered at V2.0, transforms TO V1.2
  // ... other V2.0 changes
];

export function registerAllVersionChanges() {
  VersionChangeRegistryClass.register({
    version: ApiVersion.V2_0,
    changes: V2_CHANGES,
  });
  // ... other versions
}
```

## Nested Models (NOT Registered)

For nested models like `ApiSubscription` inside `ApiCustomer`:

1. Create the change file with an **exported transform function**
2. **DO NOT register** in `versionChangeRegistry.ts`
3. Call the function from the parent's transform

```typescript
// shared/api/customers/cusPlans/changes/V1.2_CusPlanChange.ts

// Export the function for reuse
export function transformSubscriptionToCusProductV3({
  input,
  legacyData,
  ctx,
}: {
  input: ApiSubscription;
  legacyData?: CusProductLegacyData;
  ctx: VersionContext;
}): ApiCusProductV3 {
  return {
    id: input.plan_id,
    name: input.plan?.name ?? null,
    status: mapStatus(input),
    // ... transform fields
  };
}

// Define the change (for reference, not registered)
export const V1_2_CusPlanChange = defineVersionChange({
  // ...
  transformResponse: transformSubscriptionToCusProductV3,
});
```

Then call from parent:

```typescript
// V1_2_CustomerChange.ts
import { transformSubscriptionToCusProductV3 } from "../cusPlans/changes/V1.2_CusPlanChange.js";

transformResponse: ({ input, ctx }) => {
  return {
    products: input.subscriptions.map(sub => 
      transformSubscriptionToCusProductV3({ input: sub, ctx })
    ),
  };
}
```

## Request Transformations (Old → New)

For transforming incoming requests to latest format:

```typescript
// shared/api/customers/requestChanges/V1.2_CustomerQueryChange.ts

export const V1_2_CustomerQueryChange = defineVersionChange({
  newVersion: ApiVersion.V2_0,
  oldVersion: ApiVersion.V1_Beta,
  description: "Auto-expand plans.plan for V1.2 clients",
  affectedResources: [AffectedResource.Customer],
  newSchema: GetCustomerQuerySchema,
  oldSchema: GetCustomerQuerySchema,

  affectsRequest: true,   // Enable request transform
  affectsResponse: false, // Disable response transform

  // Request: V1.2 → V2.0 (transform TO newer format)
  transformRequest: ({ input }) => {
    return {
      ...input,
      expand: [...(input.expand || []), CusExpand.SubscriptionsPlan],
    };
  },
});
```

## Handler Usage

### Response Versioning (Automatic)

```typescript
// Most handlers use getApiCustomer() which handles versioning internally
const customer = await getApiCustomer({ ctx, fullCustomer });
return c.json(customer);
```

### Manual Response Versioning

```typescript
import { applyResponseVersionChanges, AffectedResource } from "@autumn/shared";

const planResponse = await getPlanResponse({ product, features });

const versionedResponse = applyResponseVersionChanges<ApiPlan>({
  input: planResponse,
  targetVersion: ctx.apiVersion,
  resource: AffectedResource.Product,
  legacyData: { features: ctx.features },
  ctx,
});

return c.json(versionedResponse);
```

### Versioned Request Validation

```typescript
export const handleUpdatePlan = createRoute({
  versionedBody: {
    latest: UpdatePlanParamsSchema,
    [ApiVersion.V1_Beta]: UpdateProductV2ParamsSchema,
  },
  versionedQuery: {
    latest: UpdatePlanQuerySchema,
    [ApiVersion.V1_Beta]: UpdateProductQuerySchema,
  },
  resource: AffectedResource.Product,
  handler: async (c) => {
    const body = c.req.valid("json"); // Always latest format!
    // ...
  },
});
```

## When Business Logic Needs Old Format

Sometimes business logic is tied to an old model version. Convert in the handler:

```typescript
// server/src/internal/products/handlers/handleUpdatePlan.ts

const body = c.req.valid("json"); // Latest format (UpdatePlanParams)

// Convert to old format for existing business logic
const v1_2Body = ctx.apiVersion.gte(new ApiVersionClass(ApiVersion.V2_0))
  ? planToProductV2({ plan: body as ApiPlan, features: ctx.features })
  : (body as UpdateProductV2Params);

// Use v1_2Body with existing business functions
await handleUpdateProductDetails({
  newProduct: UpdateProductSchema.parse(v1_2Body),
  // ...
});
```

## Side Effect Changes

For changes that affect behavior (not just data shape):

```typescript
export const V0_2_InvoicesAlwaysExpanded = defineVersionChange({
  newVersion: ApiVersion.V1_1,
  oldVersion: ApiVersion.V0_2,
  description: "Invoices always expanded in V0_2",
  affectedResources: [AffectedResource.Customer],
  hasSideEffects: true, // Marks as side-effect only
  newSchema: NoOpSchema,
  oldSchema: NoOpSchema,
  transformResponse: ({ input }) => input, // No-op
});
```

Check in handler:

```typescript
import { backwardsChangeActive, V0_2_InvoicesAlwaysExpanded } from "@autumn/shared";

if (backwardsChangeActive({
  apiVersion: ctx.apiVersion,
  versionChange: V0_2_InvoicesAlwaysExpanded,
})) {
  expand.push(CusExpand.Invoices);
}
```

## File Naming Convention

| Pattern | Example | Purpose |
|---------|---------|---------|
| `V{X}.{Y}_{Resource}Change.ts` | `V1.2_CustomerChange.ts` | Main resource transform |
| `V{X}.{Y}_{Description}.ts` | `V1.1_FeaturesArrayToObject.ts` | Specific change |
| `V{X}.{Y}_{Resource}QueryChange.ts` | `V1.2_CustomerQueryChange.ts` | Request transform |

**Name after the TARGET version** (the older version we're transforming TO).

## Key Principles

1. **Build latest, transform backwards** - Handlers always work with latest format
2. **Single-step transforms** - Each change file maps ONE version to the PREVIOUS
3. **Register top-level only** - Nested model transforms are called manually
4. **Use `satisfies`** - Ensure return types match schema: `return {...} satisfies z.infer<Schema>`

## References

- [Version Change Anatomy](./references/version-change-anatomy.md) - Deep dive on each field
- [Adding a New Version](./references/adding-new-version.md) - Step-by-step checklist
