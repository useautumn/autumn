# V2 Cache Object Design: Bounded FullCustomer + FullEntity

## Decision: Flat entitlement structure

We use a **flat entitlement-keyed** cache format instead of the current nested `customer_products[i].customer_entitlements[j]` structure. This eliminates the path index Hash entirely and future-proofs for product-level splitting.

Current (nested):
```
$.customer_products[0].customer_entitlements[1].balance
  → requires path index HGET to resolve array indices
```

New (flat):
```
$.entitlements["cusEnt_abc"].balance
  → cusEntId IS the path, no index needed
```

## Cache Format: `CachedFullCustomer`

Stored at `{orgId}:env:fullcustomer:2.0.0:customerId`

```json
{
  "customer": {
    "id": "cus_123",
    "internal_id": "cus_abc",
    "org_id": "org_xyz",
    "env": "live",
    "name": "Acme",
    "email": "billing@acme.com",
    "fingerprint": "fp_...",
    "processor": { "id": "cus_stripe_123", "type": "stripe" },
    "processors": { ... },
    "metadata": { ... },
    "send_email_receipts": true,
    "auto_topups": [ ... ],
    "spend_limits": [ ... ],
    "usage_alerts": [ ... ],
    "overage_allowed": [ ... ],
    "created_at": 1700000000000
  },
  "products": {
    "cp_001": {
      "id": "cp_001",
      "internal_product_id": "prod_int_1",
      "product_id": "pro_plan",
      "internal_customer_id": "cus_abc",
      "internal_entity_id": null,
      "status": "active",
      "subscription_ids": ["sub_stripe_1"],
      "options": [ ... ],
      "created_at": 1700000000000,
      "product": { "id": "pro_plan", "name": "Pro Plan", ... },
      "customer_prices": [
        { "id": "cp_price_1", "price_id": "price_1", "price": { ... } }
      ],
      "free_trial": null
    }
  },
  "entitlements": {
    "ce_001": {
      "id": "ce_001",
      "internal_customer_id": "cus_abc",
      "internal_entity_id": null,
      "internal_feature_id": "feat_int_1",
      "customer_product_id": "cp_001",
      "entitlement_id": "ent_1",
      "balance": 950,
      "adjustment": 0,
      "additional_balance": 0,
      "unlimited": false,
      "usage_allowed": true,
      "next_reset_at": 1703000000000,
      "cache_version": 5,
      "entities": null,
      "entitlement": {
        "id": "ent_1",
        "feature": { "id": "api_calls", "internal_id": "feat_int_1", ... },
        "entity_feature_id": null,
        ...
      },
      "rollovers": [
        { "id": "ro_1", "balance": 100, "expires_at": 1705000000000, ... }
      ],
      "replaceables": []
    }
  },
  "extraEntitlements": {
    "ce_loose_1": {
      "id": "ce_loose_1",
      "customer_product_id": null,
      ...
    }
  },
  "entities": [
    { "id": "ety_1", "internal_id": "ety_int_1", "name": "Team A", ... }
  ],
  "subscriptions": [ ... ],
  "invoices": [ ... ],
  "aggregatedEntitlements": [ ... ],
  "aggregatedProducts": { ... },
  "aggregatedPrices": [ ... ]
}
```

### Key design decisions

- **`products`**: keyed by `cusProductId`, NOT an array. Contains the product definition, prices, and free_trial — but NOT customer_entitlements (those are in `entitlements`).
- **`entitlements`**: keyed by `cusEntId`. Each entitlement has a `customer_product_id` field to link back to its product. Contains the full entitlement definition, rollovers, and replaceables inline.
- **`extraEntitlements`**: keyed by `cusEntId`, for loose entitlements where `customer_product_id` is null.
- **`entities`**: flat array (not keyed) since this is only used for entity lookup, not deduction. Only present on FullCustomer, not FullEntity.
- **`aggregated*`**: only on the bounded FullCustomer (customer-level view).

## Cache Format: `CachedFullEntity`

Stored at `{orgId}:env:fullentity:1.0.0:customerId:entityId`

```json
{
  "customer": {
    "id": "cus_123",
    "internal_id": "cus_abc",
    "processor": { ... },
    "spend_limits": [ ... ],
    "usage_alerts": [ ... ],
    "overage_allowed": [ ... ],
    "fingerprint": "fp_..."
  },
  "entity": {
    "id": "ety_1",
    "internal_id": "ety_int_1",
    "internal_customer_id": "cus_abc",
    "name": "Team A",
    "feature_id": "seats",
    "spend_limits": [ ... ],
    "usage_alerts": [ ... ],
    "overage_allowed": [ ... ]
  },
  "products": {
    "cp_entity_1": { ... },
    "cp_customer_level_1": { ... }
  },
  "entitlements": {
    "ce_entity_1": { "customer_product_id": "cp_entity_1", "balance": 500, ... },
    "ce_customer_level_1": { "customer_product_id": "cp_customer_level_1", "balance": 950, ... }
  },
  "extraEntitlements": {
    "ce_loose_1": { ... }
  }
}
```

### What's included

- **`customer`**: subset of Customer fields needed by check/track (processor for Stripe lookup, billing controls, fingerprint for trial dedup)
- **`entity`**: the full entity record (billing controls, feature_id)
- **`products`**: entity-scoped products (`internal_entity_id = this entity`) + inherited customer-level products (`internal_entity_id IS NULL`). Keyed by cusProductId.
- **`entitlements`**: all entitlements from the included products. Keyed by cusEntId.
- **`extraEntitlements`**: loose entitlements matching this entity
- **No** `entities` array, `aggregated*`, `subscriptions`, `invoices`, `trials_used`

### What's NOT included

- Other entities' products/entitlements
- Aggregated data (not needed for entity-level operations)
- Invoices, subscriptions (only needed for expand fields, fetched lazily)

## Deduction Lua Script Changes

### Current flow (path index)
```
1. HGET pathidx_key "cus_ent:{id}"    → { cp: 0, ce: 1 }
2. Build path: $.customer_products[0].customer_entitlements[1]
3. JSON.GET cache_key {path}           → entitlement object
4. JSON.NUMINCRBY cache_key {path}.balance -delta
```

### New flow (flat, no path index)
```
1. Build path: $.entitlements["{cusEntId}"]
   (or $.extraEntitlements["{cusEntId}"] for loose entitlements)
2. JSON.GET cache_key {path}           → entitlement object
3. JSON.NUMINCRBY cache_key {path}.balance -delta
```

**Changes to Lua scripts:**
- `find_entitlement_from_index` → replaced with direct path construction: `'$.entitlements["' .. cus_ent_id .. '"]'`
- `build_customer_entitlement_base_path` / `build_extra_customer_entitlement_base_path` → replaced with single function that takes cusEntId and whether it's loose
- `find_entitlement` fallback (O(n) scan) → `JSON.GET cache_key $.entitlements["{cusEntId}"]` (O(1))
- **Path index Hash is eliminated entirely** — no `HGET`, no `HSET`, no separate Redis key to manage
- The `entity_feature_id` (previously stored in path index) needs to be on the entitlement object itself — it already is, via `entitlement.entity_feature_id`

**Rollover paths:**
- Current: `$.customer_products[cp].customer_entitlements[ce].rollovers[i].balance`
- New: `$.entitlements["{cusEntId}"].rollovers[i].balance`
- Rollover array index (`i`) is still needed but this is small (typically 0-3 rollovers)

**Entity balance paths (old-style):**
- Current: `$.customer_products[cp].customer_entitlements[ce].entities["{entityId}"].balance`
- New: `$.entitlements["{cusEntId}"].entities["{entityId}"].balance`

## TypeScript Types

### In-memory types (used by all endpoint logic)

```typescript
// Bounded FullCustomer — no entity-scoped products
type BoundedFullCustomer = Customer & {
  customer_products: FullCusProduct[];     // internal_entity_id IS NULL only
  entities: Entity[];
  extra_customer_entitlements: FullCustomerEntitlement[];
  subscriptions?: Subscription[];
  invoices?: Invoice[];
  trials_used?: { product_id: string; customer_id: string; fingerprint: string }[];
  aggregated_customer_products?: FullCusProduct[];
  aggregated_customer_entitlements?: AggregatedCustomerEntitlement[];
  aggregated_customer_prices?: CustomerPrice[];
};

// FullEntity — entity-scoped + inherited customer-level products
type FullEntity = {
  customer: Customer;
  entity: Entity;
  customer_products: FullCusProduct[];     // entity + inherited
  extra_customer_entitlements: FullCustomerEntitlement[];
};
```

**Note**: `BoundedFullCustomer` has the same shape as the existing `FullCustomer` type (just fewer products). Existing code that operates on `FullCustomer` works unchanged. The `FullEntity` is a new type.

### Cache serialization types

```typescript
// What's stored in Redis (flat format)
type CachedCustomerDoc = {
  customer: Customer;
  products: Record<string, CachedProduct>;
  entitlements: Record<string, CachedEntitlement>;
  extraEntitlements: Record<string, CachedEntitlement>;
  entities?: Entity[];
  subscriptions?: Subscription[];
  invoices?: Invoice[];
  aggregatedEntitlements?: AggregatedCustomerEntitlement[];
  aggregatedProducts?: Record<string, CachedProduct>;
  aggregatedPrices?: CustomerPrice[];
};

type CachedEntityDoc = {
  customer: Customer;   // subset of fields
  entity: Entity;
  products: Record<string, CachedProduct>;
  entitlements: Record<string, CachedEntitlement>;
  extraEntitlements: Record<string, CachedEntitlement>;
};

type CachedProduct = Omit<FullCusProduct, 'customer_entitlements'>;

type CachedEntitlement = FullCustomerEntitlement & {
  customer_product_id: string | null;     // link back to product
};
```

## Hydration: Cache → In-Memory

```typescript
// CachedCustomerDoc → FullCustomer
const hydrateFullCustomer = (doc: CachedCustomerDoc): FullCustomer => {
  const entitlementsByProduct = groupBy(
    Object.values(doc.entitlements),
    (e) => e.customer_product_id
  );

  const customerProducts = Object.values(doc.products).map((product) => ({
    ...product,
    customer_entitlements: entitlementsByProduct[product.id] ?? [],
  }));

  return {
    ...doc.customer,
    customer_products: customerProducts,
    extra_customer_entitlements: Object.values(doc.extraEntitlements),
    entities: doc.entities ?? [],
    subscriptions: doc.subscriptions,
    invoices: doc.invoices,
    aggregated_customer_products: ...,
    aggregated_customer_entitlements: doc.aggregatedEntitlements,
    aggregated_customer_prices: doc.aggregatedPrices,
  };
};

// CachedEntityDoc → FullEntity
const hydrateFullEntity = (doc: CachedEntityDoc): FullEntity => {
  // Same groupBy pattern
  ...
};
```

## Dehydration: In-Memory → Cache

```typescript
// FullCustomer → CachedCustomerDoc
const dehydrateFullCustomer = (fullCustomer: FullCustomer): CachedCustomerDoc => {
  const products: Record<string, CachedProduct> = {};
  const entitlements: Record<string, CachedEntitlement> = {};

  for (const cusProduct of fullCustomer.customer_products) {
    const { customer_entitlements, ...productWithoutEnts } = cusProduct;
    products[cusProduct.id] = productWithoutEnts;

    for (const cusEnt of customer_entitlements) {
      entitlements[cusEnt.id] = { ...cusEnt, customer_product_id: cusProduct.id };
    }
  }

  const extraEntitlements: Record<string, CachedEntitlement> = {};
  for (const cusEnt of fullCustomer.extra_customer_entitlements) {
    extraEntitlements[cusEnt.id] = { ...cusEnt, customer_product_id: null };
  }

  return {
    customer: extractCustomerFields(fullCustomer),
    products,
    entitlements,
    extraEntitlements,
    entities: fullCustomer.entities,
    subscriptions: fullCustomer.subscriptions,
    invoices: fullCustomer.invoices,
    aggregatedEntitlements: fullCustomer.aggregated_customer_entitlements,
    ...
  };
};
```

## What doesn't change

- **All endpoint logic** continues to use `FullCustomer`/`FullEntity` in-memory types
- **`getApiBalances`**, **`getApiSubscriptions`**, **`fullCustomerToCustomerEntitlements`** — all unchanged
- **`syncItemV3`** — reads from cache, but the Lua deduction already writes `cusEntId` into sync messages, so sync just needs to know which cache key to read from
- **Postgres schema** — no changes
- **V2 SQL query** — no changes (returns flat rows, hydration produces `FullCustomer`)

## What changes

- **Cache set/get utilities** — serialize to flat format, deserialize back
- **Lua scripts** — use direct `$.entitlements["{id}"]` paths instead of path index
- **Path index** — eliminated entirely (no separate Redis Hash key)
- **`buildPathIndex.ts`** — deleted
- **`fullCustomerCacheConfig.ts`** — new version + entity config
- **Cache invalidation** — entity-aware (see separate plan)

## Migration path to product-level splitting (future)

If needed later, the flat structure makes this straightforward:
1. Move each product group (`products[cpId]` + its entitlements from `entitlements` where `customer_product_id === cpId`) to a separate Redis key
2. The Lua deduction script just receives a different cache key — the entitlement path `$.entitlements["{cusEntId}"]` stays identical within each product sub-doc
3. Full-read endpoints pipeline `JSON.GET` across product keys

No structural changes needed — just key routing.
