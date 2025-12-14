# Invoicing Architecture

## Final Structure

```
server/src/internal/billing/
├── invoicing/                       # NEW - orchestration & Stripe ops
│   ├── createInvoice.ts             # Create Stripe invoice
│   ├── finalizeInvoice.ts           # Finalize invoice
│   ├── collectPayment.ts            # Pay/collect invoice
│   ├── addLineItems.ts              # Add items to invoice
│   └── scenarioLineItems/           # Scenario-specific item generation
│       ├── newProductLineItems.ts
│       ├── upgradeLineItems.ts
│       ├── downgradeLineItems.ts
│       └── quantityChangeLineItems.ts

shared/utils/billingUtils/
├── cycleUtils/                      # ✅ Already exists
├── invoicingUtils/                  # Empty - populate with pure calcs
│   ├── lineItemUtils/               # Line item calculations
│   │   ├── calculateLineItemAmount.ts
│   │   ├── tieredPriceUtils.ts
│   │   └── types.ts
│   ├── prorationUtils.ts            # Proration math (uses cycleUtils)
│   └── invoiceDisplayUtils.ts       # Formatting, descriptions
```

---

## Layer 1: Pure Calculations (shared/billingUtils/invoicingUtils/)

### 1.1 `lineItemUtils/calculateLineItemAmount.ts`

Central amount calculation:

```typescript
export const calculateLineItemAmount = ({
  price,
  quantity,
  proration,
  now,
}: {
  price: Price;
  quantity?: number;
  proration?: { start: number; end: number };
  now?: number;
}): number
```

### 1.2 `lineItemUtils/tieredPriceUtils.ts`

Tiered pricing calculation (extracted from `getAmountForQuantity`):

```typescript
export const calculateTieredAmount = ({
  tiers,
  quantity,
  billingUnits,
}: {
  tiers: UsageTier[];
  quantity: number;
  billingUnits?: number;
}): number
```

### 1.3 `prorationUtils.ts`

Proration utilities integrated with `cycleUtils`:

```typescript
import { getCycleStart, getCycleEnd } from "../cycleUtils";

export const getProrationPeriod = ({
  anchor,
  interval,
  intervalCount,
  now,
}: { ... }): { start: number; end: number }

export const applyProration = ({
  amount,
  periodStart,
  periodEnd,
  now,
}): number
```

### 1.4 `invoiceDisplayUtils.ts`

Formatting and description utilities:

```typescript
export const formatLineItemDescription = ({ ... }): string
export const formatLineItemPrice = ({ ... }): string
```

---

## Layer 2: Orchestration (server/billing/invoicing/)

### 2.1 `createInvoice.ts`

```typescript
export const createInvoice = async ({
  stripeCli,
  customerId,
  currency,
  discounts,
  memo,
  collectionMethod,
}: { ... }): Promise<Stripe.Invoice>
```

### 2.2 `addLineItems.ts`

```typescript
export const addLineItemsToInvoice = async ({
  stripeCli,
  invoiceId,
  customerId,
  lineItems,
}: {
  stripeCli: Stripe;
  invoiceId: string;
  customerId: string;
  lineItems: LineItemOutput[];
}): Promise<void>
```

### 2.3 `collectPayment.ts`

Clear replacement for `payForInvoice`:

```typescript
export const collectPayment = async ({
  stripeCli,
  invoiceId,
  paymentMethod,
  options,
}: {
  stripeCli: Stripe;
  invoiceId: string;
  paymentMethod?: Stripe.PaymentMethod;
  options?: {
    voidOnFail?: boolean;
    errorOnFail?: boolean;
  };
}): Promise<{ paid: boolean; invoice: Stripe.Invoice; error?: Error }>
```

### 2.4 `scenarioLineItems/`

Each scenario uses the pure utils from `invoicingUtils`:

```typescript
// upgradeLineItems.ts
import { calculateLineItemAmount, applyProration } from "@autumn/shared";

export const getUpgradeLineItems = async ({
  ctx,
  curCusProduct,
  newProduct,
  sub,
}: { ... }): Promise<LineItemOutput[]>
```

---

## Summary

| Location | Purpose | Dependencies |
|----------|---------|--------------|
| `shared/.../invoicingUtils/lineItemUtils/` | Pure math (amounts, tiers) | None |
| `shared/.../invoicingUtils/prorationUtils.ts` | Proration math | cycleUtils |
| `shared/.../invoicingUtils/invoiceDisplayUtils.ts` | Formatting | None |
| `server/.../billing/invoicing/` | Stripe ops, orchestration | invoicingUtils, Stripe |
| `server/.../billing/invoicing/scenarioLineItems/` | Scenario-specific logic | invoicingUtils, Stripe |

