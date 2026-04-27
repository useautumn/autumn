# Part B: Cache Invalidation + Missing Indexes

## Goal

Update cache invalidation for the entity-split architecture, and add missing Postgres indexes that impact the V2 query.

## Cache Invalidation

### New entity cache invalidation

- `deleteCachedFullEntity` — delete entity key + set guard, across all regions
- Entity mutations (create/delete/update) → invalidate that entity's cache
- Product attachment/detachment → invalidate correct cache:
  - Entity-scoped product (`internal_entity_id` set) → invalidate that entity cache
  - Customer-level product (`internal_entity_id IS NULL`) → invalidate customer cache AND all entity caches (they embed inherited products)

### Batch deletion

- `batchDeleteCachedFullCustomers` must also delete entity caches
- Two approaches:
  1. `SCAN` with pattern `{orgId}:env:fullentity:*:customerId:*` (scoped to hash slot, efficient)
  2. Maintain entity key registry on the customer cache (avoids SCAN)
- Use Redis pipelining for batch operations across regions

### Version-aware invalidation

- V1 customers: delete single blob key
- V2 customers: delete bounded customer key + all entity keys
- During rolling migration: check customer bucket to determine which keys to delete
- After billing actions: always delete both customer + all entity caches

## Missing Postgres Indexes

### P0 — List customers (sequential scan)

```sql
CREATE INDEX idx_customers_org_env_created_at
ON customers (org_id, env, created_at DESC);
```

There's a commented-out index in `shared/models/cusModels/cusTable.ts` — uncomment or replace.

### P1 — Entity LATERAL pattern

```sql
CREATE INDEX idx_customer_products_customer_product_created
ON customer_products (internal_customer_id, internal_product_id, created_at DESC);
```

### P2 — Partial index for non-entity products

```sql
CREATE INDEX idx_customer_products_customer_status_non_entity
ON customer_products (internal_customer_id, status)
WHERE internal_entity_id IS NULL;
```

## V2 Query Anti-Patterns to Fix

1. **Correlated subqueries against CTEs** → pre-aggregate + LEFT JOIN
2. **OFFSET pagination** → keyset/cursor pagination on `(created_at, internal_id)`
3. **Triple-nested correlated subquery in rollovers** → pre-compute cus_ent_id set
4. **`row_to_json()::jsonb - 'key'`** → `json_build_object()` with explicit columns
5. **`jsonb_each()` row explosion** → phase out old-style entity balance JSONB

## Scalability Monitoring

- TTL jitter (3 days +/- random hours) to prevent thundering herd
- `work_mem` for CTE materialization in list queries
- Connection pooling during cache miss storms after deployments
