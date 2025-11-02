# Deduction RPC Functions

This directory contains PostgreSQL stored functions for balance deduction operations.

## Files

- `deductFromSingleEntity.sql` - Helper function to deduct from a specific entity balance
- `deductFromAllEntities.sql` - Helper function to iteratively deduct from all entities
- `deductAllowance.sql` - Main function that orchestrates the deduction process

## Versioning Strategy

To ensure safe deployments when changing function signatures:

### Adding a Version Suffix

When modifying a function's parameters or return type:

1. **Increment the version number** in the function name:
   ```sql
   -- Old
   CREATE FUNCTION deduct_from_single_entity(...)
   
   -- New
   CREATE FUNCTION deduct_from_single_entity_v2(...)
   ```

2. **Update all callers** to use the new version:
   ```sql
   -- In deductAllowance.sql
   FROM deduct_from_single_entity_v2(...)
   ```

3. **Keep the old version** during deployment to prevent breaking existing instances

4. **Clean up after deployment**:
   ```sql
   -- After confirming new version works in production
   DROP FUNCTION IF EXISTS deduct_from_single_entity;
   DROP FUNCTION IF EXISTS deduct_from_single_entity_v1;
   ```

### Why Version Suffixes?

PostgreSQL identifies functions by their signature (name + parameter types). When you:
- Change parameter types (e.g., `numeric` → `bigint`)
- Add/remove parameters
- Change return types

...the `DROP FUNCTION IF EXISTS` with explicit signatures won't match the old function, leading to orphaned functions in the database.

**Versioning solves this by:**
- Creating a new function alongside the old one
- Allowing gradual rollout without breaking existing instances
- Giving you time to verify the new version works before cleanup

### Example Migration

```sql
-- deployment-v1.sql
CREATE FUNCTION process_data_v2(
  input jsonb,
  new_param text  -- Added new parameter
) RETURNS jsonb AS $$
  -- new implementation
$$ LANGUAGE plpgsql;

-- After deployment and verification
-- cleanup.sql
DROP FUNCTION IF EXISTS process_data;
DROP FUNCTION IF EXISTS process_data_v1;
```

## Loading Order

Functions are loaded in this order during server startup (see `server/src/index.ts`):
1. Helper functions (dependencies)
2. Main function (depends on helpers)

This ensures all dependencies exist before they're called.

