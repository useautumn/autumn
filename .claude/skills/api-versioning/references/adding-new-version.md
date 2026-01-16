# Adding a New API Version

Step-by-step checklist for introducing a new API version.

## Overview

When you make a **breaking change** to the API, you need to:
1. Add the new version to the enum
2. Create schemas for old/new formats
3. Create version change file(s)
4. Register the changes
5. Update handlers if needed

## Step 1: Add Version to Enum

File: `shared/api/versionUtils/ApiVersion.ts`

```typescript
export enum ApiVersion {
  V2_1 = "2.1.0",    // NEW: Add above latest
  V2_0 = "2.0.0",
  V1_Beta = "beta",
  V1_2 = "1.2.0",
  // ...
}

export const LATEST_VERSION = ApiVersion.V2_1;  // Update latest
```

## Step 2: Create Previous Version Schema

Move/copy the current schema to `previousVersions/`:

File: `shared/api/customers/previousVersions/apiCustomerV4.ts`

```typescript
// This is the V2.0 schema (now "old")
export const ApiCustomerV4Schema = z.object({
  subscriptions: z.array(ApiSubscriptionSchema),
  balances: z.record(ApiBalanceSchema),
  // ... current V2.0 fields
});

export type ApiCustomerV4 = z.infer<typeof ApiCustomerV4Schema>;
```

## Step 3: Update Latest Schema

File: `shared/api/customers/apiCustomer.ts`

```typescript
// This is now V2.1 schema (the "new" format)
export const ApiCustomerSchema = z.object({
  subscriptions: z.array(ApiSubscriptionSchema),
  balances: z.record(ApiBalanceSchema),
  usage_summary: ApiUsageSummarySchema,  // NEW FIELD
  // ... V2.1 fields
});
```

## Step 4: Create Version Change File

File: `shared/api/customers/changes/V2.0_CustomerChange.ts`

```typescript
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
  AffectedResource,
  defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { ApiCustomerSchema } from "../apiCustomer.js";
import { ApiCustomerV4Schema } from "../previousVersions/apiCustomerV4.js";

export const V2_0_CustomerChange = defineVersionChange({
  newVersion: ApiVersion.V2_1,   // Where breaking change introduced
  oldVersion: ApiVersion.V2_0,   // Target version (transforming TO)
  description: "Added usage_summary field",
  affectedResources: [AffectedResource.Customer],
  newSchema: ApiCustomerSchema,
  oldSchema: ApiCustomerV4Schema,

  transformResponse: ({ input }) => {
    // Remove V2.1 fields for V2.0 clients
    const { usage_summary, ...rest } = input;
    return rest;
  },
});
```

## Step 5: Register the Change

File: `shared/api/versionUtils/versionChangeUtils/versionChangeRegistry.ts`

```typescript
import { V2_0_CustomerChange } from "@api/customers/changes/V2.0_CustomerChange.js";

// Add new version's changes array
export const V2_1_CHANGES: VersionChangeConstructor[] = [
  V2_0_CustomerChange,
];

export function registerAllVersionChanges() {
  // Add new version registration
  VersionChangeRegistryClass.register({
    version: ApiVersion.V2_1,
    changes: V2_1_CHANGES,
  });

  VersionChangeRegistryClass.register({
    version: ApiVersion.V2_0,
    changes: V2_CHANGES,  // Existing
  });
  // ...
}
```

## Step 6: Update Request Validation (If Needed)

If the request schema changed:

File: `shared/api/customers/requestChanges/V2.0_CustomerQueryChange.ts`

```typescript
export const V2_0_CustomerQueryChange = defineVersionChange({
  newVersion: ApiVersion.V2_1,
  oldVersion: ApiVersion.V2_0,
  description: "Added usage_summary expand option",
  affectedResources: [AffectedResource.Customer],
  newSchema: GetCustomerQueryV2Schema,
  oldSchema: GetCustomerQuerySchema,

  affectsRequest: true,
  affectsResponse: false,

  transformRequest: ({ input }) => {
    // Transform old query to new format
    return {
      ...input,
      include_usage: input.expand?.includes("usage_summary") ?? false,
    };
  },
});
```

Then register in `V2_1_CHANGES`:

```typescript
export const V2_1_CHANGES: VersionChangeConstructor[] = [
  V2_0_CustomerChange,
  V2_0_CustomerQueryChange,
];
```

## Step 7: Update Handler (If Using Versioned Body/Query)

File: `server/src/internal/customers/handlers/handleGetCustomerV2.ts`

```typescript
export const handleGetCustomerV2 = createRoute({
  versionedQuery: {
    latest: GetCustomerQueryV2Schema,  // Updated to new schema
    [ApiVersion.V2_0]: GetCustomerQuerySchema,
    [ApiVersion.V1_2]: GetCustomerQuerySchema,
  },
  resource: AffectedResource.Customer,
  handler: async (c) => {
    // Handler receives latest format via versionedValidator
    const { include_usage } = c.req.valid("query");
    // ...
  },
});
```

## Checklist

- [ ] Add version to `ApiVersion` enum
- [ ] Update `LATEST_VERSION`
- [ ] Create `previousVersions/` schema for old format
- [ ] Update main schema with new format
- [ ] Create version change file in `changes/`
- [ ] (If request changed) Create request change file in `requestChanges/`
- [ ] Add changes array (e.g., `V2_1_CHANGES`)
- [ ] Register in `registerAllVersionChanges()`
- [ ] (If versioned validation) Update handler schemas
- [ ] Test with both old and new client versions

## Common Patterns

### Adding a Field

```typescript
transformResponse: ({ input }) => {
  const { new_field, ...rest } = input;  // Remove new field
  return rest;
};
```

### Removing a Field

```typescript
transformResponse: ({ input, legacyData }) => {
  return {
    ...input,
    old_field: legacyData?.old_field ?? null,  // Restore old field
  };
};
```

### Renaming a Field

```typescript
transformResponse: ({ input }) => {
  const { new_name, ...rest } = input;
  return {
    ...rest,
    old_name: new_name,  // Map new → old name
  };
};
```

### Changing Field Structure

```typescript
// V2.1: features is an array
// V2.0: features is a record

transformResponse: ({ input }) => {
  return {
    ...input,
    features: Object.fromEntries(
      input.features.map(f => [f.id, f])
    ),
  };
};
```
