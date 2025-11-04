# API Entity Utils

This directory contains the refactored entity response generation logic, following the same pattern as the customer API (`getApiCustomer.ts`).

## Architecture

The system follows a two-step approach similar to the customer API:

1. **Base Entity** (cacheable) - Core entity data without expand fields
2. **Expand Fields** (not cacheable) - Additional fields like invoices

## Files

### Main Entry Point

**`getApiEntity.ts`**
- Main function that orchestrates getting entity data
- Combines base entity and expand fields
- Handles customer fetching if `fullCus` not provided
- Ready for version changes when entities have versioning

### Core Components

**`getApiEntityBase.ts`**
- Gets base entity without expand fields
- Filters customer products using `filterCusProductsByEntity`
- Reuses `getApiCusFeatures` and `getApiCusProducts` with filtered products
- This is the core entity object that will be cacheable (caching to be implemented later)
- Returns: products and features for the entity

**`getApiEntityExpand.ts`**
- Gets expand fields that aren't cacheable
- Currently supports: invoices
- Returns: optional expand fields based on `expand` parameter

### Helper Functions

The entity API reuses the existing customer functions (`getApiCusFeatures` and `getApiCusProducts`) by filtering the customer products first:

**Filtering Logic** (via `filterCusProductsByEntity` from `@autumn/shared`)
- Filters customer products for the specific entity
- Uses `org.config.entity_product` to determine filtering logic
- Creates a filtered `fullCus` with entity-specific products

**Reused Functions**
- `getApiCusFeatures` - Gets features for filtered products
- `getApiCusProducts` - Gets products for filtered products
- Both work seamlessly with filtered products and entity set on `fullCus`

## Usage

```typescript
import { getApiEntity } from "@/internal/entities/entityUtils/apiEntityUtils";

const entityResponse = await getApiEntity({
  ctx,
  entity,
  expand: [EntityExpand.Invoices],
  withAutumnId: false,
  customerId: "cus_123",
  entityId: "ent_456",
  fullCus, // Optional - will fetch if not provided
});
```

## Pattern Comparison

### Customer API Pattern
```typescript
getCachedApiCustomer → { apiCustomer, legacyData }
getApiCustomerExpand → { invoices, rewards, etc. }
Merge → Apply version changes → Return ApiCustomer
```

### Entity API Pattern (Current)
```typescript
filterCusProductsByEntity → entityCusProducts
getApiEntityBase → 
  ├─ getApiCusFeatures(filteredFullCus) → features
  └─ getApiCusProducts(filteredFullCus) → products
getApiEntityExpand → { invoices }
Merge → (version changes to be added) → Return EntityResponse
```

**Key Insight**: The entity API reuses customer functions by filtering products first, reducing code duplication and ensuring consistency.

## Future Enhancements

1. **Caching**: Implement Redis caching for base entity (similar to `getCachedApiCustomer`)
2. **Version Changes**: Add when entities need API versioning
3. **More Expand Fields**: Add support for additional expand options as needed

## Related Files

- Customer equivalent: `server/src/internal/customers/cusUtils/apiCusUtils/`
- Shared types: `shared/api/entities/apiEntity.ts`
- Entity expand enum: `shared/models/cusModels/entityModels/entityExpand.ts`

