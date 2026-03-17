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
  Dashboard = "dashboard",       // Boolean feature
  Messages = "messages",         // Single use (prepaid/consumable)
  Users = "users",               // Continuous use (seats)
  Workflows = "workflows",       // Continuous use
  Admin = "admin",               // Continuous use
  AdminRights = "admin_rights",  // Boolean
  Words = "words",               // Single use (pay per use)
  Storage = "storage",           // Single use (prepaid)
  Credits = "credits",           // Credit system
  Action1 = "action1",          // Single use
  Action2 = "action2",          // Single use
  Action3 = "action3",          // Single use
  Credits2 = "credits2",        // Credit system
}
```

## Item Fixtures (`items.*`)

### Boolean Features

```typescript
items.dashboard()      // On/off access (TestFeature.Dashboard)
items.adminRights()    // Admin rights access (TestFeature.AdminRights)
```

### Free Metered (resets monthly)

```typescript
items.monthlyMessages({ includedUsage?: number, entityFeatureId?, resetUsageWhenEnabled? })  // Default: 100
items.monthlyWords({ includedUsage?: number, entityFeatureId?, resetUsageWhenEnabled? })     // Default: 100
items.monthlyCredits({ includedUsage?: number, rolloverConfig? })   // Default: 100
items.monthlyUsers({ includedUsage?: number })     // Default: 5
items.freeUsers({ includedUsage?: number })        // Default: 5 (same as monthlyUsers)
items.free({ featureId, includedUsage?: number })  // Default: 100 — generic free metered
items.unlimitedMessages()                          // No usage cap
items.lifetimeMessages({ includedUsage?: number, entityFeatureId? }) // Default: 100, never resets (interval: null)
```

### Rollover Features

```typescript
import { RolloverExpiryDurationType } from "@autumn/shared";

items.monthlyMessagesWithRollover({
  includedUsage?: number,      // Default: 100
  rolloverConfig: {            // REQUIRED
    max: number | null,        // Maximum rollover amount (null = unlimited)
    length: number,            // Number of periods to keep rollovers
    duration: RolloverExpiryDurationType,  // Month, Year, etc.
  },
})
```

### Prepaid (purchase upfront, recurring)

```typescript
items.prepaidMessages({
  includedUsage?: number,  // Default: 0 (free balance before paid)
  billingUnits?: number,   // Default: 100 (units per pack)
  price?: number,          // Default: 10 ($ per pack)
  config?: ProductItemConfig,
  entityFeatureId?: string,
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
  entityFeatureId?: string,
})
```

### Tiered Prepaid (graduated pricing)

```typescript
items.tieredPrepaidMessages({
  includedUsage?: number,   // Default: 0
  billingUnits?: number,    // Default: 100
  tiers?: { to: number | "inf"; amount: number }[],  // Default: [{ to: 500, amount: 10 }, { to: "inf", amount: 5 }]
  config?: ProductItemConfig,
})
```
Graduated pricing: first 500 units at $10/pack, remaining at $5/pack (100 units/pack).

### Volume Prepaid

```typescript
items.volumePrepaidMessages({
  includedUsage?: number,   // Default: 0
  billingUnits?: number,    // Default: 100
  tiers?: { to: number | "inf"; amount: number; flat_amount?: number | null }[],
  config?: ProductItemConfig,
})
```
Volume-based: whole quantity charged at whichever tier it falls into.

### One-Off (no recurring charges)

```typescript
items.oneOffMessages({ includedUsage?: number, billingUnits?: number, price?: number })  // Defaults: 0, 100, $10
items.oneOffWords({ includedUsage?: number, billingUnits?: number, price?: number })     // Defaults: 0, 100, $10
items.oneOffStorage({ includedUsage?: number, billingUnits?: number, price?: number })   // Defaults: 0, 100, $10
items.tieredOneOffMessages({ includedUsage?: number, billingUnits?: number, tiers? })    // Graduated one-off
```

### Consumable (pay-per-use/arrears)

```typescript
items.consumableMessages({
  includedUsage?: number,  // Default: 0 (free before overage)
  entityFeatureId?: string,
  interval?: ProductItemInterval,
  maxPurchase?: number,    // Sets usage_limit = maxPurchase + includedUsage
  price?: number,          // Default: 0.10
})  // $0.10 per unit overage

items.consumableWords({
  includedUsage?: number,  // Default: 0
  entityFeatureId?: string,
  interval?: ProductItemInterval,
})  // $0.05 per unit overage

// Generic consumable for any feature
items.consumable({
  featureId: string,
  includedUsage?: number,   // Default: 0
  price?: number,           // Default: 0.10
  billingUnits?: number,    // Default: 1
  entityFeatureId?: string,
  interval?: ProductItemInterval,
  maxPurchase?: number,
})
```

### Tiered Consumable (graduated pay-per-use)

```typescript
items.tieredConsumableMessages({
  includedUsage?: number,   // Default: 0
  billingUnits?: number,    // Default: 1
  tiers?: { to: number | "inf"; amount: number }[],  // Default: [{ to: 500, amount: 0.10 }, { to: "inf", amount: 0.05 }]
})
```

### Allocated (prorated seats)

```typescript
items.allocatedUsers({ includedUsage?: number })       // Default: 0, $10/seat (TestFeature.Users)
items.allocatedMessages({ includedUsage?: number })    // Default: 0, $10/unit (TestFeature.Messages)
items.allocatedWorkflows({ includedUsage?: number })   // Default: 0, $10/workflow (TestFeature.Workflows)
items.freeAllocatedUsers({ includedUsage?: number, entityFeatureId? })      // Default: 5, no price (TestFeature.Users)
items.freeAllocatedWorkflows({ includedUsage?: number, entityFeatureId? })  // Default: 5, no price (TestFeature.Workflows)
```

### Base Prices

```typescript
items.monthlyPrice({ price?: number })  // Default: $20/month
items.annualPrice({ price?: number })   // Default: $200/year
items.oneOffPrice({ price?: number })   // Default: $50 one-time
```

## Product Fixtures (`products.*`)

### `products.base()` — FREE Product (no base price)

```typescript
products.base({
  items: ProductItem[],
  id?: string,           // Default: "base"
  isDefault?: boolean,   // Default: false — set true for default free tier
  isAddOn?: boolean,     // Default: false
  trialDays?: number,    // Optional trial
})
```

### `products.pro()` — $20/month

```typescript
products.pro({ items: ProductItem[], id?: string })  // Default ID: "pro"
```

### `products.premium()` — $50/month

```typescript
products.premium({ items: ProductItem[], id?: string })  // Default ID: "premium"
```

### `products.growth()` — $100/month

```typescript
products.growth({ items: ProductItem[], id?: string })  // Default ID: "growth"
```

### `products.ultra()` — $200/month

```typescript
products.ultra({ items: ProductItem[], id?: string })  // Default ID: "ultra"
```

### `products.proAnnual()` — $200/year

```typescript
products.proAnnual({ items: ProductItem[], id?: string })  // Default ID: "pro-annual"
```

### `products.proWithTrial()` — $20/month + trial

```typescript
products.proWithTrial({
  items: ProductItem[],
  id?: string,           // Default: "pro-trial"
  trialDays?: number,    // Default: 7
  cardRequired?: boolean,// Default: true
})
```

### `products.premiumWithTrial()` — $50/month + trial

```typescript
products.premiumWithTrial({
  items: ProductItem[],
  id?: string,           // Default: "premium-trial"
  trialDays?: number,    // Default: 7
  cardRequired?: boolean,// Default: true
})
```

### `products.baseWithTrial()` — Free + trial

```typescript
products.baseWithTrial({
  items: ProductItem[],
  id?: string,           // Default: "base-trial"
  trialDays?: number,    // Default: 7
  cardRequired?: boolean,// Default: false
})
```

### `products.defaultTrial()` — Default + $20/month + trial (no card required)

```typescript
products.defaultTrial({
  items: ProductItem[],
  id?: string,           // Default: "default-trial"
  trialDays?: number,    // Default: 7
  cardRequired?: boolean,// Default: false
})
```
`is_default: true` — auto-assigned to new customers.

### `products.oneOff()` — $10 one-time

```typescript
products.oneOff({ items: ProductItem[], id?: string })  // Default ID: "one-off"
```

### `products.recurringAddOn()` — $20/month add-on

```typescript
products.recurringAddOn({ items: ProductItem[], id?: string })  // Default ID: "addon"
```
`is_add_on: true` — doesn't replace existing products.

### `products.oneOffAddOn()` — $10 one-time add-on

```typescript
products.oneOffAddOn({ items: ProductItem[], id?: string })  // Default ID: "one-off-addon"
```
`is_add_on: true`.

## Product Fixture Summary Table

| Product | Built-in Base Price | Default ID | Notes |
|---------|-------------------|------------|-------|
| `products.base` | **None** (free) | "base" | `isDefault`, `isAddOn` options |
| `products.pro` | **$20/mo** | "pro" | |
| `products.premium` | **$50/mo** | "premium" | |
| `products.growth` | **$100/mo** | "growth" | |
| `products.ultra` | **$200/mo** | "ultra" | |
| `products.proAnnual` | **$200/yr** | "pro-annual" | |
| `products.proWithTrial` | **$20/mo** + trial | "pro-trial" | `trialDays`, `cardRequired` |
| `products.premiumWithTrial` | **$50/mo** + trial | "premium-trial" | `trialDays`, `cardRequired` |
| `products.baseWithTrial` | **None** + trial | "base-trial" | `cardRequired: false` |
| `products.defaultTrial` | **$20/mo** + trial | "default-trial" | `is_default: true`, `cardRequired: false` |
| `products.oneOff` | **$10 one-time** | "one-off" | |
| `products.recurringAddOn` | **$20/mo** add-on | "addon" | `is_add_on: true` |
| `products.oneOffAddOn` | **$10 one-time** add-on | "one-off-addon" | `is_add_on: true` |

**NEVER add `items.monthlyPrice()` to `products.pro()` — it already has $20/mo built in.** Same for premium ($50), growth ($100), ultra ($200).

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

## Billing Behavior Summary

| Item Type | On Attach | On Update | On Cycle End |
|-----------|-----------|-----------|--------------|
| Base Price | Charged | Prorated | Renewed |
| Consumable | Not charged | Not charged | Overage billed |
| Allocated | Charged for overage | Prorated for current overage | Renewed |
| Prepaid | Charged (packs * price) | Refund old + Charge new | Renewed |
| One-Off | Charged once | N/A | Not renewed |
