# Entity-Based Testing

Entities enable per-entity product attachments (workspaces, projects, teams, seats).

## Core Concepts

### Two Entity Patterns (Important!)

There are **two distinct ways** to use entities in Autumn:

#### 1. Entity Products (Attaching products TO entities)
- Each entity gets its own product attachment
- Entities have independent subscriptions
- Tracking on entity deducts from entity's own balance first
- See: `server/tests/balances/track/entity-products/`

```typescript
// Attach product TO an entity
await autumnV1.attach({
  customer_id: customerId,
  entity_id: entity.id,  // Product attached to this entity
  product_id: pro.id,
});
```

#### 2. Per-Entity Features (Products with entity-scoped balances)
- Customer has ONE product with features that track usage PER entity
- Each entity gets its own balance allocation for that feature
- Uses `entity_feature_id` in product item configuration
- See: `server/tests/balances/track/entity-balances/`

```typescript
// Product item with per-entity balance
const perEntityMessages = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 1000,
  entityFeatureId: TestFeature.Users,  // Each User entity gets 1000 messages
});

// Attach product to CUSTOMER (not entity)
await autumnV1.attach({
  customer_id: customerId,
  product_id: pro.id,  // No entity_id - attached at customer level
});

// Create entities - each automatically gets their per-entity balance
await autumnV1.entities.create(customerId, [
  { id: "user1", name: "User 1", feature_id: TestFeature.Users },
  { id: "user2", name: "User 2", feature_id: TestFeature.Users },
]);

// Track usage for specific entity
await autumnV1.track({
  customer_id: customerId,
  entity_id: "user1",
  feature_id: TestFeature.Messages,
  value: 100,  // Deducts from user1's 1000 balance
});
```

**Key Difference:**
- **Entity Products**: `attach({ entity_id })` - product belongs to entity
- **Per-Entity Features**: `entity_feature_id` in item config - balance distributed to entities

### Per-Entity Features: Billing Implications

For per-entity consumable features:

1. **Base price is charged ONCE** (at customer level), not per entity
2. **Overage is SUMMED across all entities FIRST, then rounded up** to billing units
3. **Each entity has its own included usage** that resets independently

```typescript
// Per-entity consumable: 100 included per entity, $0.10/unit overage
const perEntityConsumable = items.consumableMessages({
  includedUsage: 100,
  entityFeatureId: TestFeature.Users,  // Makes it per-entity
});

const pro = products.pro({  // $20/month base
  items: [perEntityConsumable],
});

// Attach ONCE to customer (NOT to each entity)
s.attach({ productId: pro.id })  // No entityIndex!

// Track to specific entities
s.track({ featureId: TestFeature.Messages, value: 150, entityIndex: 0 })  // 50 overage
s.track({ featureId: TestFeature.Messages, value: 250, entityIndex: 1 })  // 150 overage

// Invoice calculation:
// - Base price: $20 (single, not per entity)
// - Entity 1 overage: 50
// - Entity 2 overage: 150
// - Total overage: 50 + 150 = 200 → rounded to billing units → 200 * $0.10 = $20
// - Total invoice: $20 + $20 = $40
```

**Billing Units Rounding**: For per-entity consumables with `billingUnits > 1`, ALL entity overages are **SUMMED FIRST**, then the **TOTAL** is rounded up to billing units:

```typescript
// billingUnits=10, $1/10 units
// Entity 1: 55 overage
// Entity 2: 23 overage
// Total: 55 + 23 = 78 → ceil(78/10) = 8 → 8 * $1 = $8
// NOT: ceil(55/10) + ceil(23/10) = 6 + 3 = $9 ❌
```

**Common Mistake**: Don't attach per-entity feature products to each entity separately - this creates multiple subscriptions with multiple base charges!

### What are Entities?

Entities are sub-units of a customer that can have their own:
- Product attachments (different products per entity)
- Feature balances (usage tracked per entity)
- Billing (invoiced at entity level)

### Entity Balance Aggregation

**Customer-level balance = sum of all entity balances + customer-level product balances**

Example:
- Customer has product with 100 messages
- Entity 1 has product with 50 messages
- Entity 2 has product with 50 messages
- **Customer total balance = 200 messages**
- **Entity 1 balance = 150 messages** (50 own + 100 inherited from customer)
- **Entity 2 balance = 150 messages** (50 own + 100 inherited from customer)

### Tracking at Different Levels

```typescript
// Track at customer level - deducts from customer's balance first
await autumnV1.track({
  customer_id: customerId,
  feature_id: TestFeature.Messages,
  value: 10,
});

// Track at entity level - deducts from entity's balance first
await autumnV1.track({
  customer_id: customerId,
  entity_id: entities[0].id,
  feature_id: TestFeature.Messages,
  value: 10,
});
```

## Setting Up Entities with `initScenario`

```typescript
const { customerId, autumnV1, entities } = await initScenario({
  customerId: "entity-test",
  setup: [
    s.customer({ paymentMethod: "success" }),
    s.products({ list: [pro, free] }),
    s.entities({ count: 3, featureId: TestFeature.Users }),
  ],
  actions: [
    s.attach({ productId: pro.id, entityIndex: 0 }),   // ent-1 gets pro
    s.attach({ productId: free.id, entityIndex: 1 }),  // ent-2 gets free
    // ent-3 has no product attached
  ],
});

// Access entities
console.log(entities[0].id);  // "ent-1"
console.log(entities[1].id);  // "ent-2"
console.log(entities[2].id);  // "ent-3"
```

### Generated Entity Structure

```typescript
{
  id: "ent-1",           // Auto-generated ID
  name: "Entity 1",      // Auto-generated name
  featureId: "users",    // From s.entities config
}
```

## Entity Actions

### Attach to Entity

```typescript
s.attach({
  productId: pro.id,
  entityIndex: 0,  // 0-based index into entities array
})
```

### Cancel Entity Product

```typescript
s.cancel({
  productId: pro.id,
  entityIndex: 0,
})
```

### Attach with Prepaid to Entity

```typescript
s.attach({
  productId: pro.id,
  entityIndex: 0,
  options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
})
```

## Fetching Entity Data

```typescript
// Get specific entity
const entity = await autumnV1.entities.get({
  customer_id: customerId,
  entity_id: entities[0].id,
});

// Skip cache for fresh data
const entity = await autumnV1.entities.get(customerId, entities[0].id, {
  skip_cache: "true",
});

// Entity has same structure as customer for features
expectCustomerFeatureCorrect({
  customer: entity,  // Works with entities!
  featureId: TestFeature.Messages,
  balance: 100,
});
```

## Common Entity Patterns

### Different Products Per Entity

```typescript
test.concurrent(`${chalk.yellowBright("entities: different products")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const pro = products.pro({ items: [messagesItem] });
  const free = products.base({ id: "free", items: [messagesItem] });

  const { customerId, autumnV1, entities } = await initScenario({
    customerId: "entity-diff-products",
    setup: [
      s.customer({ paymentMethod: "success" }),
      s.products({ list: [pro, free] }),
      s.entities({ count: 2, featureId: TestFeature.Users }),
    ],
    actions: [
      s.attach({ productId: pro.id, entityIndex: 0 }),
      s.attach({ productId: free.id, entityIndex: 1 }),
    ],
  });

  // Entity 1: pro (with $20 charge)
  const entity1 = await autumnV1.entities.get({ customer_id: customerId, entity_id: entities[0].id });
  await expectProductActive({ customer: entity1, productId: pro.id });

  // Entity 2: free (no charge)
  const entity2 = await autumnV1.entities.get({ customer_id: customerId, entity_id: entities[1].id });
  await expectProductActive({ customer: entity2, productId: free.id });

  // Only 1 invoice (from entity 1's pro)
  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });
});
```

### Customer + Entity Products (Balance Inheritance)

```typescript
test.concurrent(`${chalk.yellowBright("entities: balance inheritance")}`, async () => {
  // Customer-level product
  const customerItem = items.monthlyMessages({ includedUsage: 100 });
  const customerProd = products.base({ id: "customer-prod", items: [customerItem] });

  // Entity-level product
  const entityItem = items.monthlyMessages({ includedUsage: 50 });
  const entityProd = products.base({ id: "entity-prod", items: [entityItem] });

  const { customerId, autumnV1, entities } = await initScenario({
    customerId: "entity-inherit",
    setup: [
      s.customer({}),
      s.products({ list: [customerProd, entityProd] }),
      s.entities({ count: 2, featureId: TestFeature.Users }),
    ],
    actions: [
      s.attach({ productId: customerProd.id }),  // Customer-level
      s.attach({ productId: entityProd.id, entityIndex: 0 }),
      s.attach({ productId: entityProd.id, entityIndex: 1 }),
    ],
  });

  // Customer balance = 100 (own) + 50 + 50 (entities) = 200
  const customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Messages].balance).toBe(200);

  // Entity 1 balance = 50 (own) + 100 (inherited from customer) = 150
  const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
  expect(entity1.features[TestFeature.Messages].balance).toBe(150);
});
```

### Tracking Per Entity

```typescript
test.concurrent(`${chalk.yellowBright("entities: per-entity tracking")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const prod = products.base({ items: [messagesItem] });

  const { customerId, autumnV1, entities } = await initScenario({
    customerId: "entity-track",
    setup: [
      s.customer({}),
      s.products({ list: [prod] }),
      s.entities({ count: 3, featureId: TestFeature.Users }),
    ],
    actions: [
      s.attach({ productId: prod.id, entityIndex: 0 }),
      s.attach({ productId: prod.id, entityIndex: 1 }),
      s.attach({ productId: prod.id, entityIndex: 2 }),
    ],
  });

  // Track on entity 1
  await autumnV1.track({
    customer_id: customerId,
    entity_id: entities[0].id,
    feature_id: TestFeature.Messages,
    value: 10,
  });

  // Customer total = 300 - 10 = 290
  const customer = await autumnV1.customers.get(customerId);
  expect(customer.features[TestFeature.Messages].balance).toBe(290);

  // Entity 1 = 100 - 10 = 90
  const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
  expect(entity1.features[TestFeature.Messages].balance).toBe(90);

  // Entity 2 still at 100 (not affected)
  const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
  expect(entity2.features[TestFeature.Messages].balance).toBe(100);
});
```

### Entity Update (Free to Paid)

```typescript
test.concurrent(`${chalk.yellowBright("entities: upgrade entity to paid")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const free = products.base({ id: "free", items: [messagesItem] });

  const { customerId, autumnV1, ctx, entities } = await initScenario({
    customerId: "entity-upgrade",
    setup: [
      s.customer({ paymentMethod: "success" }),
      s.products({ list: [free] }),
      s.entities({ count: 2, featureId: TestFeature.Users }),
    ],
    actions: [
      s.attach({ productId: free.id, entityIndex: 0 }),
      s.attach({ productId: free.id, entityIndex: 1 }),
    ],
  });

  // Upgrade entity 1's free to paid
  const priceItem = items.monthlyPrice({ price: 20 });
  
  await autumnV1.subscriptions.update({
    customer_id: customerId,
    entity_id: entities[0].id,
    product_id: free.id,
    items: [messagesItem, priceItem],
  });

  // Entity 1 now has paid subscription
  const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
  await expectProductActive({ customer: entity1, productId: free.id });

  // Verify invoice created for entity 1
  const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
  expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });
});
```

### Entity Downgrade with Scheduled Change

```typescript
test.concurrent(`${chalk.yellowBright("entities: scheduled downgrade")}`, async () => {
  const messagesItem = items.monthlyMessages({ includedUsage: 100 });
  const pro = products.pro({ items: [messagesItem] });
  const free = products.base({ id: "free", items: [messagesItem] });

  const { customerId, autumnV1, entities } = await initScenario({
    customerId: "entity-downgrade",
    setup: [
      s.customer({ paymentMethod: "success" }),
      s.products({ list: [pro, free] }),
      s.entities({ count: 1, featureId: TestFeature.Users }),
    ],
    actions: [
      s.attach({ productId: pro.id, entityIndex: 0 }),  // Start with pro
    ],
  });

  // Downgrade: attach free (schedules for end of cycle)
  await autumnV1.attach({
    customer_id: customerId,
    entity_id: entities[0].id,
    product_id: free.id,
  });

  // Pro still active, free is scheduled
  const entity = await autumnV1.entities.get(customerId, entities[0].id);
  expectProductAttached({ customer: entity, product: pro, status: CusProductStatus.Active });
  expectProductAttached({ customer: entity, product: free, status: CusProductStatus.Scheduled });
});
```

## Cache vs Database Verification

For critical tests, verify cache matches database:

```typescript
// Wait for sync
await new Promise(r => setTimeout(r, 2000));

// Compare
const fromCache = await autumnV1.entities.get(customerId, entityId);
const fromDb = await autumnV1.entities.get(customerId, entityId, { skip_cache: "true" });

expect(fromCache.features[TestFeature.Messages].balance)
  .toBe(fromDb.features[TestFeature.Messages].balance);
```
