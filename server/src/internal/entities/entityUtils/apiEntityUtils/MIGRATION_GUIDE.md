# Migration Guide: getSingleEntityResponse → getApiEntity

This guide shows how to migrate from the old `getSingleEntityResponse` to the new `getApiEntity` pattern.

## Quick Comparison

### Old Pattern (`getSingleEntityResponse`)

```typescript
// In getEntityUtils.ts
const entityResponse = await getSingleEntityResponse({
  entityId,
  org,
  env,
  fullCus,
  entity,
  features,
  withAutumnId,
});
```

### New Pattern (`getApiEntity`)

```typescript
// Using the new approach
import { getApiEntity } from "@/internal/entities/entityUtils/apiEntityUtils";

const entityResponse = await getApiEntity({
  ctx,
  entity,
  expand: [],
  withAutumnId,
  customerId, // Optional if fullCus provided
  entityId,   // Optional if fullCus provided
  fullCus,    // Optional - will fetch if not provided
});
```

## Key Differences

| Aspect | Old (`getSingleEntityResponse`) | New (`getApiEntity`) |
|--------|--------------------------------|---------------------|
| Context | Receives individual params (org, env, db, features) | Receives `ctx` (RequestContext) |
| Customer Data | Requires `fullCus` | Optional - fetches if not provided |
| Expand Support | No expand pattern | Uses `expand` array for future extensibility |
| Caching | No caching | Ready for Redis caching (to be implemented) |
| Version Changes | No version support | Ready for version changes when needed |
| Structure | Single function | Split into base + expand (follows customer pattern) |

## Benefits of New Pattern

1. **Consistent with Customer API**: Uses same structure as `getApiCustomer`
2. **Code Reuse**: Reuses `getApiCusFeatures` and `getApiCusProducts` by filtering products
3. **Redis-Ready**: Works with Redis-cached balances from track implementation
4. **Cacheable**: Base entity can be cached separately from expand fields
5. **Extensible**: Easy to add new expand fields in the future
6. **Type-Safe**: Strongly typed with `EntityResponse` schema
7. **Context-Aware**: Uses `ctx` for better middleware integration
8. **No Duplication**: Uses `filterCusProductsByEntity` utility instead of duplicating filter logic

## Migration Checklist

When migrating code:

- [ ] Replace `getSingleEntityResponse` calls with `getApiEntity`
- [ ] Convert individual params (org, env, db, features) to `ctx`
- [ ] Add `expand` parameter (empty array if no expand needed)
- [ ] Remove `features` parameter (handled internally)
- [ ] Update imports from old location to new location
- [ ] Test with Redis-cached customer data

## Example Migration

### Before (Old Code)

```typescript
// In handleGetEntity.ts (old)
const { entities, customer, fullEntities, invoices } = await getEntityResponse({
  db,
  entityIds: [entityId],
  org,
  env,
  customerId,
  expand,
  entityId,
  withAutumnId: false,
  apiVersion,
  features,
  logger,
});

const entity = entities[0];
```

### After (New Code)

```typescript
// In handleGetEntity.ts (new - using createRoute)
const entity = await getApiEntity({
  ctx,
  entity: fullCus.entities.find(e => e.id === entityId),
  expand,
  withAutumnId: false,
  customerId,
  entityId,
  fullCus, // Optional
});
```

## Next Steps

After migrating to `getApiEntity`:

1. **Implement Caching**: Add Redis caching for base entity (similar to customer)
2. **Update handleGetEntity**: Use `createRoute` and new pattern
3. **Add Expand Fields**: Add more expand options as needed
4. **Version Changes**: Add when entity API versioning is required

