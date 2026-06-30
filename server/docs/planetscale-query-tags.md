# PlanetScale Query Tags

This document describes how to add custom query tags (nicknames) to SQL queries for better observability in PlanetScale Insights.

## Overview

Query tags are key-value pairs embedded in SQL comments that PlanetScale parses automatically. They help filter and identify queries in Insights and Database Traffic Control.

### Format

Tags follow the SQLCommenter specification:
```sql
SELECT * FROM customers WHERE id = $1 /*query='getFullCustomer',priority='high'*/
```

## Implementation

### Helper Function

Use the `planetScaleTag()` helper from `@/db/dbUtils.js`:

```typescript
import { planetScaleTag } from "@/db/dbUtils.js";

const query = sql`
  SELECT * FROM customers 
  WHERE id = ${id}
  ${planetScaleTag({ query: "getFullCustomer", priority: "high" })}
`;
```

### Tagged Queries

The following queries have been tagged with custom nicknames:

#### Core Customer Queries
- **`getFullSubject`** - Full subject/customer data with all relations
  - Location: `server/src/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery.ts`
  - Tag: `query='getFullSubject'`

- **`getFullCustomer`** - Full customer lookup by ID
  - Location: `server/src/internal/customers/getFullCusQuery.ts`
  - Tag: `query='getFullCustomer'`

- **`getCursorPaginatedFullCustomers`** - Paginated customer list
  - Location: `server/src/internal/customers/cursorPaginatedFullCusQuery.ts`
  - Tag: `query='getCursorPaginatedFullCustomers'`

#### Customer Products
- **`getCustomerProductsPage`** - Customer products pagination
  - Location: `server/src/internal/customers/getCustomerProductsPageQuery.ts`
  - Tag: `query='getCustomerProductsPage'`

- **`getCustomerProductsCount`** - Customer products count
  - Location: `server/src/internal/customers/getCustomerProductsPageQuery.ts`
  - Tag: `query='getCustomerProductsCount'`

#### Cron & Background Jobs
- **`getActiveResetPassed`** - Fetch customer entitlements for reset cron
  - Location: `server/src/internal/customers/cusProducts/cusEnts/CusEntitlementService.ts`
  - Tag: **Not yet tagged** (requires Drizzle v1.0+ for unionAll queries)
  - Note: Target tag `query='getActiveResetPassed'` will be added after Drizzle upgrade

## Adding Tags to New Queries

### For Raw SQL Queries

When building queries with the `sql` template tag:

```typescript
import { planetScaleTag } from "@/db/dbUtils.js";
import { sql } from "drizzle-orm";

const query = sql`
  SELECT * FROM customers 
  WHERE org_id = ${orgId}
  ${planetScaleTag({ query: "myQueryName" })}
`;

const result = await db.execute(query);
```

### For Query Builder with db.execute()

When using Drizzle's query builder but executing with `db.execute()`:

```typescript
import { planetScaleTag } from "@/db/dbUtils.js";

const query = db
  .select()
  .from(customers)
  .where(eq(customers.id, customerId));

// Get SQL and add tag
const queryWithTag = sql`${query.getSQL()} ${planetScaleTag({ query: "myQueryName" })}`;
const result = await db.execute(queryWithTag);
```

### Tag Placement

- Tags must appear **before the semicolon** (if present)
- Add tags as the last element before closing the query
- Tags are appended to the SQL string at runtime

## Best Practices

1. **Use descriptive names** - Match the function or operation name (e.g., `getFullCustomer`, not `query1`)
2. **Keep it short** - Query names should be concise but clear
3. **Use snake_case or camelCase** - Be consistent with naming conventions
4. **Add context when needed** - Include additional tags for priority, feature area, etc.
5. **Tag high-value queries** - Focus on queries that:
   - Run frequently
   - Are performance-critical
   - Are difficult to identify from SQL alone
   - Are used in background jobs/cron

## Finding Tags in PlanetScale Insights

In the PlanetScale Insights dashboard, filter queries by tag:

```
tag:query:getFullCustomer
```

You can also:
- Filter by multiple tags: `tag:query:getFullCustomer tag:priority:high`
- View all tags for a query in the query details page
- Set up Database Traffic Control rules based on tags

## Limitations

- Tag keys and values must match `[\w\-./:,]+` after URL decoding
- Keys: max 65 bytes
- Values: max 1024 bytes
- High-cardinality tag values may be collapsed by PlanetScale
- With Drizzle ORM 0.43.1, tags must be added manually (no native `.comment()` method)

## Future Improvements

When upgrading to Drizzle ORM v1.0.0+, queries using the query builder pattern can use the native `.comment()` method:

```typescript
// Future syntax (requires Drizzle v1.0.0+)
const result = await db
  .select()
  .from(customers)
  .where(eq(customers.id, customerId))
  .comment({ query: 'getFullCustomer' });
```

## Resources

- [PlanetScale Query Tags Documentation](https://planetscale.com/docs/postgres/monitoring/query-tags)
- [SQLCommenter Specification](https://google.github.io/sqlcommenter/)
- [Drizzle ORM v1.0.0-beta.19 Release Notes](https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-beta.19)
