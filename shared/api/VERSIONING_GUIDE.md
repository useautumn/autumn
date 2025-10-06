# API Versioning Architecture Guide

## Overview

This guide explains how to handle API versioning when schema components are shared across multiple resources and endpoints.

## The Challenge: Shared Schema Components

When schema components are embedded in multiple resources, version changes need to be applied consistently across all endpoints.

**Example:**
```typescript
// CoreCusFeatureSchema is shared across:
// 1. Customer → features: ApiCusFeature[]
// 2. CheckResult → extends CoreCusFeatureSchema directly

export const ApiCusFeatureSchema = z.object({
  id: z.string(),
  type: z.enum(ApiFeatureType),
  name: z.string().nullish(),
}).extend(CoreCusFeatureSchema.shape);

export const CheckResultSchema = z.object({
  allowed: z.boolean(),
  customer_id: z.string(),
  feature_id: z.string(),
  // ...
}).extend(CoreCusFeatureSchema.shape); // ← Same schema!
```

## Architecture: Compositional Version Changes

### Principle
**Define version changes at the schema component level, then compose them for each resource.**

### Step 1: Define Shared Transformation Logic

Create reusable transformation functions for shared schema components:

```typescript
// shared/api/customers/cusFeatures/changes/featureTransformUtils.ts

import type { ApiCusFeature } from "../apiCusFeature.js";
import type { ApiCusFeatureV2 } from "../previousVersions/apiCusFeatureV2.js";

/**
 * Transform a V1.2+ feature (with breakdown) to V1.1 format (expanded intervals)
 * 
 * @param feature - Feature in V1.2+ format
 * @returns Array of features in V1.1 format (one per interval if breakdown exists)
 */
export const transformFeatureV1_2ToV1_1 = (
  feature: ApiCusFeature
): ApiCusFeatureV2[] => {
  const v1_1_features: ApiCusFeatureV2[] = [];
  
  // If feature has breakdown, expand into separate entries
  if (feature.breakdown && feature.breakdown.length > 0) {
    for (const breakdownItem of feature.breakdown) {
      v1_1_features.push({
        feature_id: feature.id,
        interval: breakdownItem.interval,
        interval_count: breakdownItem.interval_count,
        balance: breakdownItem.balance,
        usage: breakdownItem.usage,
        included_usage: breakdownItem.included_usage,
        next_reset_at: breakdownItem.next_reset_at,
        usage_limit: breakdownItem.usage_limit || breakdownItem.included_usage,
        rollovers: breakdownItem.rollovers,
        unlimited: false,
        overage_allowed: false,
      });
    }
  } else {
    // Handle single feature without breakdown
    if (feature.unlimited) {
      v1_1_features.push({
        feature_id: feature.id,
        unlimited: true,
      });
    } else if (feature.type === "static") {
      v1_1_features.push({
        feature_id: feature.id,
      });
    } else {
      v1_1_features.push({
        feature_id: feature.id,
        interval: feature.interval === "multiple" ? null : feature.interval,
        interval_count: feature.interval_count,
        balance: feature.balance,
        usage: feature.usage,
        included_usage: feature.included_usage,
        next_reset_at: feature.next_reset_at,
        usage_limit: feature.usage_limit || feature.included_usage,
        rollovers: feature.rollovers,
        unlimited: feature.unlimited,
        overage_allowed: feature.overage_allowed,
      });
    }
  }
  
  return v1_1_features;
};
```

### Step 2: Create Resource-Specific Version Changes

Use the shared transformation logic in each resource's version change:

#### Customer Version Change

```typescript
// shared/api/customers/changes/V1_2_FeaturesArrayToObject.ts

import { defineVersionChange } from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { transformFeatureV1_2ToV1_1 } from "../cusFeatures/changes/featureTransformUtils.js";

export const V1_2_FeaturesArrayToObject = defineVersionChange({
  version: ApiVersion.V1_2,
  description: "Features: object with breakdown → array with expanded intervals",
  affectedResources: [AffectedResource.Customer],
  newSchema: V1_2_CustomerSchema,
  oldSchema: V1_1_CustomerSchema,
  
  transformResponse: ({ input }) => {
    // Transform all features using shared logic
    const v1_1_features = Object.values(input.features)
      .flatMap(transformFeatureV1_2ToV1_1); // ← Reuse!
    
    return {
      ...input,
      features: v1_1_features,
    };
  },
});
```

#### CheckResult Version Change

```typescript
// shared/api/core/changes/V1_2_CheckResultFeatureFields.ts

import { defineVersionChange } from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { transformFeatureV1_2ToV1_1 } from "@api/customers/cusFeatures/changes/featureTransformUtils.js";

export const V1_2_CheckResultFeatureFields = defineVersionChange({
  version: ApiVersion.V1_2,
  description: "CheckResult: feature fields with breakdown → expanded fields",
  affectedResources: [AffectedResource.CheckResult],
  newSchema: CheckResultV1_2Schema,
  oldSchema: CheckResultV1_1Schema,
  
  transformResponse: ({ input }) => {
    // Extract non-feature fields
    const {
      allowed,
      customer_id,
      feature_id,
      code,
      required_balance,
      entity_id,
      preview,
      ...featureFields
    } = input;
    
    // Transform feature fields using shared logic
    const transformedFeatures = transformFeatureV1_2ToV1_1({
      id: feature_id,
      type: input.type,
      name: input.name,
      ...featureFields,
    } as ApiCusFeature);
    
    // CheckResult has a single feature, so take the first transformed one
    const transformedFeature = transformedFeatures[0];
    
    return {
      allowed,
      customer_id,
      feature_id: transformedFeature.feature_id,
      code,
      required_balance,
      entity_id,
      preview,
      ...transformedFeature,
    };
  },
});
```

### Step 3: Apply Transformations at Endpoints

Each endpoint applies version changes for its specific resource:

```typescript
// server/src/internal/customers/cusUtils/apiCusUtils/getApiCustomer.ts
export const getApiCustomer = async ({ ctx, fullCus }) => {
  const apiCustomer = ApiCustomerSchema.parse({
    // ... build customer data
    features: apiCusFeatures,
  });

  // Applies V1_2_FeaturesArrayToObject (Customer resource)
  return applyResponseVersionChanges({
    input: apiCustomer,
    targetVersion: ctx.apiVersion,
    resource: AffectedResource.Customer,
  });
};
```

```typescript
// server/src/internal/api/entitled/checkUtils/getV2CheckResponse.ts
export const getV2CheckResponse = async ({ ... }) => {
  const checkResult = CheckResultSchema.parse({
    customer_id: fullCus.id,
    feature_id: featureToUse.id,
    allowed,
    ...cusFeature, // ← Contains CoreCusFeatureSchema fields
  });

  // Applies V1_2_CheckResultFeatureFields (CheckResult resource)
  return applyResponseVersionChanges({
    input: checkResult,
    targetVersion: ctx.apiVersion,
    resource: AffectedResource.CheckResult,
  });
};
```

## Key Principles

### 1. **Shared Logic, Multiple Applications**
- Define transformation logic once in utility functions
- Apply consistently across all resources that embed the schema

### 2. **Resource-Level Version Changes**
- Each resource (Customer, CheckResult) has its own version change
- Version changes specify which resources they affect via `affectedResources`

### 3. **Schema Composition Drives Change Composition**
- If `CheckResultSchema` extends `CoreCusFeatureSchema`, the version change must handle both
- If `ApiCustomerSchema` contains `features: Record<string, ApiCusFeature>`, the version change must transform the features

### 4. **Automatic Application**
- Call `applyResponseVersionChanges()` with the appropriate `resource` parameter
- The system automatically finds and applies relevant version changes

## Adding New Shared Schema Components

When adding a new schema component that's shared across resources:

1. **Create transformation utilities**
   ```typescript
   // shared/api/[component]/changes/[component]TransformUtils.ts
   export const transformComponentV1_2ToV1_1 = (input) => { /* ... */ };
   ```

2. **Create version changes for each affected resource**
   ```typescript
   // For each resource that embeds the component:
   export const V1_2_ResourceA_ComponentChange = defineVersionChange({
     affectedResources: [AffectedResource.ResourceA],
     transformResponse: ({ input }) => {
       // Use shared transformation
       const transformed = transformComponentV1_2ToV1_1(input.component);
       return { ...input, component: transformed };
     },
   });
   ```

3. **Register version changes**
   ```typescript
   // shared/api/versionUtils/versionChangeUtils/versionChangeRegistry.ts
   export const V1_2_CHANGES = [
     V1_2_ResourceA_ComponentChange,
     V1_2_ResourceB_ComponentChange,
     // ...
   ];
   ```

4. **Apply at endpoints**
   ```typescript
   return applyResponseVersionChanges({
     input: data,
     targetVersion: ctx.apiVersion,
     resource: AffectedResource.ResourceA,
   });
   ```

## Benefits of This Architecture

✅ **DRY** - Transformation logic defined once, reused everywhere  
✅ **Type-safe** - Schemas enforce correctness at compile-time  
✅ **Automatic** - Applied via `applyResponseVersionChanges`  
✅ **Scalable** - Easy to add more shared components or resources  
✅ **Consistent** - Same logic applies everywhere the schema is used  
✅ **Testable** - Transformation utilities can be unit tested independently  

## Anti-Patterns to Avoid

❌ **Duplicating transformation logic** across resources  
❌ **Applying version changes at the wrong level** (e.g., at feature level when it affects customer)  
❌ **Manual field-by-field transformations** in endpoint handlers  
❌ **Side-effect version changes** (use `hasSideEffects: false` when possible)  
❌ **Mixing concerns** (transformation logic vs business logic)  

## Example: Complete Flow

```
User requests Customer with API version 1.1
    ↓
1. getApiCustomer() builds latest format (1.2+)
    ↓
2. applyResponseVersionChanges() called with:
   - input: Customer with features as object with breakdown
   - targetVersion: 1.1
   - resource: AffectedResource.Customer
    ↓
3. System finds V1_2_FeaturesArrayToObject
    ↓
4. Calls transformResponse():
   - Uses transformFeatureV1_2ToV1_1() for each feature
   - Expands breakdown into separate array entries
   - Converts object to array
    ↓
5. Returns Customer in 1.1 format
    ↓
Response sent to user
```

## Questions?

If you're unsure how to handle a new versioning scenario:

1. **Identify what schema components are shared** across resources
2. **Extract transformation logic** into utility functions
3. **Create version changes** for each affected resource
4. **Apply at the outermost level** (endpoint/handler)
5. **Test both directions** (forward and backward transformations)

---

**Remember:** Version changes should mirror your schema composition. If schemas are nested, version changes should handle the entire nesting hierarchy at the outermost level.

