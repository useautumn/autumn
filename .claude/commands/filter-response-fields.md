---
description: Filter (hide) fields from an API response so they are not visible to external SDK consumers
argument-hint: [schema-name] [field1, field2, ...]
---

# Filter Response Fields

Hide internal fields from external API responses using the response filter middleware. The middleware runs on all `/v1/*` API routes and recursively strips specified fields from JSON responses. Dashboard requests are automatically bypassed.

## How it works

The response filter uses an `object` discriminator field on each JSON object in the response to determine which filter rules to apply. At runtime, the middleware walks the entire response tree, and for each object with an `object` field, it looks up that value in `responseFilterConfig` to find which fields to strip.

## Steps

### 1. Add `object` literal to the Zod schema

In the schema file (under `shared/`), add an `object` field with a `z.literal()` value:

```typescript
export const MyResponseSchema = z.object({
  object: z.literal("my_response").meta({ internal: true }),
  // ... existing fields
  secret_field: z.string().meta({ internal: true }),
});
```

- The `object` value should be a snake_case identifier for this schema
- Mark it `.meta({ internal: true })` so it's also excluded from OpenAPI docs
- The schema **must be exported** (so it can be imported into the filter config)

### 2. Add `object` to all construction sites

Find every place in `server/` that constructs objects of this type and add the `object` field:

```typescript
return {
  object: "my_response" as const,
  // ... existing fields
};
```

Search for:
- Functions with the return type annotation (e.g., `): MyResponse =>`)
- `satisfies MyResponse` patterns
- Spread patterns that assemble the type inline (e.g., `{ ...baseResponse, extra_field }`)

### 3. Register in the filter config

In `server/src/honoMiddlewares/responseFilter/responseFilterConfig.ts`:

1. Import the schema and its inferred type from `@autumn/shared`
2. Add a `createFilterConfig` entry to the `filterConfigs` array

```typescript
createFilterConfig<MyResponse>({
  schema: MyResponseSchema,
  omitFields: ["secret_field", "object"],
}),
```

Always include `"object"` in `omitFields` so the discriminator itself is stripped from external responses.

## Gotcha: Schema inheritance

When a schema extends another (e.g., `AttachPreviewResponseSchema` extends `BillingPreviewResponseSchema`), each schema has its **own** `object` literal value. At runtime, the response will only have **one** `object` value -- the most derived one.

This means: **fields inherited from the parent schema must be listed in the child's `omitFields` too**, not just the parent's.

Example:

```typescript
// Parent schema has object: "billing_preview"
// - omitFields: ["period_start", "period_end", "object"]

// Child schema has object: "attach_preview" (overrides parent's object)
// - MUST also include parent's filtered fields:
// - omitFields: ["redirect_type", "incoming", "outgoing", "object", "period_start", "period_end"]
```

The child's `object` literal **overrides** the parent's, so the middleware will only match the child's filter config -- it will never see `"billing_preview"` on an attach preview response. If you forget to duplicate the parent's omitted fields in the child config, those fields will leak through.

## Key files

- **Schema definitions**: `shared/api/` (wherever the Zod schema lives)
- **Filter config**: `server/src/honoMiddlewares/responseFilter/responseFilterConfig.ts`
- **Filter middleware**: `server/src/honoMiddlewares/responseFilter/responseFilterMiddleware.ts`
- **Dashboard bypass**: The middleware checks `ctx.authType === AuthType.Dashboard` and skips filtering, so dashboard requests always receive the full unfiltered response.

## Checklist

- [ ] Added `object: z.literal("...").meta({ internal: true })` to the schema
- [ ] Schema is exported from its file and re-exported from `@autumn/shared`
- [ ] Added `object: "..." as const` to every place that constructs this type
- [ ] Added `createFilterConfig` entry in `responseFilterConfig.ts`
- [ ] Included `"object"` in the `omitFields` array
- [ ] If schema extends another filtered schema, duplicated parent's `omitFields` in child config
- [ ] Verified with an API request that filtered fields are stripped
- [ ] Verified dashboard still receives unfiltered response
