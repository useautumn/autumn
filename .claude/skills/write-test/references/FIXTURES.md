# Item and Product Fixtures

## Imports

```typescript
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { TestFeature } from "@tests/setup/v2Features.js";
```

## Available Test Features

```typescript
enum TestFeature {
  Dashboard = "dashboard",    // Boolean feature
  Messages = "messages",      // Single use (prepaid)
  Users = "users",           // Continuous use (seats)
  Workflows = "workflows",   // Continuous use
  Admin = "admin",           // Continuous use
  AdminRights = "admin_rights", // Boolean
  Words = "words",           // Single use (pay per use)
  Storage = "storage",       // Single use (prepaid)
  Credits = "credits",       // Credit system
  Action1 = "action1",       // Single use
  Action2 = "action2",       // Single use
  Action3 = "action3",       // Single use
  Credits2 = "credits2",     // Credit system
}
```

## Item Fixtures (`items.*`)

### Boolean Features

```typescript
items.dashboard()      // On/off access
items.adminRights()    // Admin rights access
```

### Free Metered (resets monthly)

```typescript
items.monthlyMessages({ includedUsage?: number })  // Default: 100
items.monthlyWords({ includedUsage?: number })     // Default: 100
items.monthlyCredits({ includedUsage?: number })   // Default: 100
items.monthlyUsers({ includedUsage?: number })     // Default: 5
items.unlimitedMessages()                          // No usage cap
items.lifetimeMessages({ includedUsage?: number }) // Default: 100, never resets
```

### Prepaid (purchase upfront)

```typescript
items.prepaidMessages({
  includedUsage?: number,  // Default: 0 (free balance before paid)
  billingUnits?: number,   // Default: 100 (units per pack)
  price?: number,          // Default: 10 ($ per pack)
  config?: ProductItemConfig,
})

items.prepaidUsers({
  includedUsage?: number,  // Default: 0
  billingUnits?: number,   // Default: 1 (per seat)
})

// Generic prepaid for any feature
items.prepaid({
  featureId: string,
  price?: number,        // Default: 10
  billingUnits?: number, // Default: 100
  includedUsage?: number,// Default: 0
  config?: ProductItemConfig,
})
```

### One-Off (no recurring charges)

```typescript
items.oneOffMessages({
  includedUsage?: number,  // Default: 0
  billingUnits?: number,   // Default: 100
  price?: number,          // Default: 10
})
```

### Consumable (pay-per-use/arrears)

```typescript
items.consumableMessages({
  includedUsage?: number,  // Default: 0 (free before overage)
})  // $0.10 per unit overage
```

### Allocated (prorated seats)

```typescript
items.allocatedUsers({
  includedUsage?: number,  // Default: 0 (free seats)
})  // $10 per seat
```

### Base Prices

```typescript
items.monthlyPrice({ price?: number })  // Default: $20/month
items.annualPrice({ price?: number })   // Default: $200/year
items.oneOffPrice({ price?: number })   // Default: $50 one-time
```

## Product Fixtures (`products.*`)

### `products.base()`

No base price. Use for free products or custom pricing.

```typescript
products.base({
  items: ProductItem[],
  id?: string,           // Default: "base"
  isDefault?: boolean,   // Default: false
  isAddOn?: boolean,     // Default: false
  trialDays?: number,    // Optional trial
})
```

### `products.pro()`

**Includes $20/month base price.** Don't add `monthlyPrice()`.

```typescript
products.pro({
  items: ProductItem[],
  id?: string,  // Default: "pro"
})
```

### `products.proAnnual()`

**Includes $200/year base price.**

```typescript
products.proAnnual({
  items: ProductItem[],
  id?: string,  // Default: "pro-annual"
})
```

### `products.proWithTrial()`

Pro with configurable free trial.

```typescript
products.proWithTrial({
  items: ProductItem[],
  id?: string,           // Default: "pro-trial"
  trialDays?: number,    // Default: 7
  cardRequired?: boolean,// Default: true
})
```

### `products.baseWithTrial()`

Free product with trial (for feature gating).

```typescript
products.baseWithTrial({
  items: ProductItem[],
  id?: string,           // Default: "base-trial"
  trialDays?: number,    // Default: 7
  cardRequired?: boolean,// Default: false
})
```

### `products.oneOff()`

One-time purchase with $10 base price.

```typescript
products.oneOff({
  items: ProductItem[],
  id?: string,  // Default: "one-off"
})
```

## Common Patterns

### Free Product

```typescript
const messagesItem = items.monthlyMessages({ includedUsage: 100 });
const free = products.base({ items: [messagesItem] });
```

### Paid Product (Pro)

```typescript
const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
const pro = products.pro({ items: [messagesItem] });
// Total: $20/mo + 1000 messages
```

### Custom Pricing

```typescript
const priceItem = items.monthlyPrice({ price: 30 });
const messagesItem = items.monthlyMessages({ includedUsage: 500 });
const custom = products.base({
  id: "custom",
  items: [priceItem, messagesItem],
});
// Total: $30/mo + 500 messages
```

### Prepaid Product

```typescript
const prepaidItem = items.prepaidMessages({
  includedUsage: 0,     // No free messages
  billingUnits: 100,    // 1 pack = 100 messages
  price: 10,            // $10 per pack
});
const prepaidPro = products.base({ id: "prepaid", items: [prepaidItem] });
```

### Allocated Seats

```typescript
const seatsItem = items.allocatedUsers({ includedUsage: 3 });
// 3 free seats, $10/seat overage (prorated)
const team = products.base({ id: "team", items: [seatsItem] });
```

### Pay-Per-Use (Consumable)

```typescript
const consumableItem = items.consumableMessages({ includedUsage: 100 });
// 100 free, then $0.10/message (billed at end of cycle)
const usage = products.base({ id: "usage", items: [consumableItem] });
```

### Multiple Feature Types

```typescript
const priceItem = items.monthlyPrice({ price: 50 });
const messagesItem = items.monthlyMessages({ includedUsage: 500 });
const seatsItem = items.allocatedUsers({ includedUsage: 5 });
const dashboardItem = items.dashboard();

const enterprise = products.base({
  id: "enterprise",
  items: [priceItem, messagesItem, seatsItem, dashboardItem],
});
```

### Product with Trial

```typescript
const messagesItem = items.monthlyMessages({ includedUsage: 100 });
const proTrial = products.proWithTrial({
  items: [messagesItem],
  trialDays: 14,
  cardRequired: true,
});
```

### Annual Product

```typescript
const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
const proAnnual = products.proAnnual({ items: [messagesItem] });
// $200/year + 1000 messages
```

## Billing Behavior Summary

| Item Type | On Attach | On Update | On Cycle End |
|-----------|-----------|-----------|--------------|
| Base Price | Charged | Prorated | Renewed |
| Consumable | Not charged | Not charged | Overage billed |
| Allocated | Charged for overage | Prorated for current overage | Renewed |
| Prepaid | Charged (packs * price) | Refund old + Charge new | Renewed |
| One-Off | Charged once | N/A | Not renewed |
