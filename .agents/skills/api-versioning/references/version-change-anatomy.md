# Version Change Anatomy

Deep dive into each field of `defineVersionChange()`.

## Full Configuration

```typescript
export const V1_2_CustomerChange = defineVersionChange({
  // Required fields
  newVersion: ApiVersion.V2_0,
  oldVersion: ApiVersion.V1_Beta,
  description: ["Change 1", "Change 2"],
  affectedResources: [AffectedResource.Customer],
  newSchema: ApiCustomerSchema,
  oldSchema: ApiCustomerV3Schema,

  // Optional fields
  name: "V1_2_CustomerChange",  // For debugging
  legacyDataSchema: CustomerLegacyDataSchema,
  affectsRequest: false,   // Default: false
  affectsResponse: true,   // Default: true
  hasSideEffects: false,   // Default: false

  // Transform functions
  transformResponse: ({ input, legacyData, ctx }) => { ... },
  transformRequest: ({ input, legacyData }) => { ... },
});
```

## Version Fields

### `newVersion`

The version where the **breaking change was introduced**.

```typescript
newVersion: ApiVersion.V2_0  // V2.0 introduced this breaking change
```

### `oldVersion`

The version we're **transforming TO**. Transform is applied when `targetVersion <= oldVersion`.

```typescript
oldVersion: ApiVersion.V1_Beta  // We transform TO V1.2 format
```

**Example**: If user is on V1.1 and `oldVersion` is V1.2, this change IS applied (V1.1 <= V1.2).

## Schema Fields

### `newSchema`

Zod schema for the **latest/newer** format. Input to `transformResponse()` must match this.

### `oldSchema`

Zod schema for the **older** format. Output from `transformResponse()` is validated against this.

### `legacyDataSchema` (Optional)

Schema for **legacy fields** that were removed in newer versions but need to be reconstructed for older versions.

```typescript
// Customer had product_ids in V1.2, removed in V2.0
export const CustomerLegacyDataSchema = z.object({
  cusProductLegacyData: z.record(CusProductLegacyDataSchema),
  cusFeatureLegacyData: z.record(CusFeatureLegacyDataSchema),
});
```

## Behavior Flags

### `affectsRequest`

Set `true` if this change transforms **incoming requests** (old → new).

```typescript
affectsRequest: true  // transformRequest() will be called
```

### `affectsResponse`

Set `true` if this change transforms **outgoing responses** (new → old). Default: `true`.

```typescript
affectsResponse: true  // transformResponse() will be called
```

### `hasSideEffects`

Set `true` for changes that affect **behavior**, not data shape. Transforms become no-ops.

```typescript
hasSideEffects: true  // transformResponse() is skipped; handle logic elsewhere
```

Use with `backwardsChangeActive()` in handlers:

```typescript
if (backwardsChangeActive({ apiVersion: ctx.apiVersion, versionChange: V0_2_InvoicesAlwaysExpanded })) {
  expand.push(CusExpand.Invoices);
}
```

## Transform Functions

### `transformResponse`

Called for **response** transformations (new → old).

```typescript
transformResponse: ({ input, legacyData, ctx }) => {
  // input: Data in newSchema format (latest)
  // legacyData: Data from legacyDataSchema (optional)
  // ctx: { features: Feature[] } - runtime context

  return {
    // Return data in oldSchema format
  } satisfies z.infer<typeof ApiCustomerV3Schema>;
}
```

### `transformRequest`

Called for **request** transformations (old → new).

```typescript
transformRequest: ({ input, legacyData }) => {
  // input: Data in oldSchema format (user's request)
  // legacyData: Data from legacyDataSchema (optional)

  return {
    // Return data in newSchema format (latest)
  } satisfies z.infer<typeof GetCustomerQuerySchema>;
}
```

## `affectedResources`

Specifies which resources this change applies to. Used by `applyResponseVersionChanges()` to filter changes.

```typescript
affectedResources: [AffectedResource.Customer]
```

Available resources (from `VersionChange.ts`):

```typescript
enum AffectedResource {
  Customer = "customer",
  Entity = "entity",
  CusProduct = "cus_product",
  CusFeature = "cus_feature",
  CusBalance = "cus_balance",
  Invoice = "invoice",
  Product = "product",
  Feature = "feature",
  Check = "check",
  Track = "track",
  Checkout = "checkout",
  Attach = "attach",
  ApiSubscriptionUpdate = "api_subscription_update",
}
```

## Version Context

The `ctx` parameter provides runtime data needed for transformations:

```typescript
interface VersionContext {
  features: Feature[];  // Organization's features
}
```

Used when transform needs to look up feature data:

```typescript
transformResponse: ({ input, ctx }) => {
  const feature = ctx.features.find(f => f.id === input.feature_id);
  return {
    feature_name: feature?.name ?? null,
    // ...
  };
}
```

## Validation Behavior

### Response Transform Output

Output is validated with `safeParse()`:
- If validation **succeeds**: Extra fields are stripped, cleaned data returned
- If validation **fails**: Original (unvalidated) data returned for graceful degradation

### Compile-Time Excess Property Checking

TypeScript allows excess properties in object spreads. Use `satisfies` for compile-time errors:

```typescript
return {
  id: input.id,
  oldField: input.newField,
} satisfies z.infer<typeof OldSchema>;  // Compile error if shape wrong
```

For stricter runtime validation, use `schema.strict()`:

```typescript
oldSchema: ApiCustomerV3Schema.strict()  // Runtime error on extra fields
```
