# BillingUpdateOnIncrease

Billing behavior when quantity increases mid-cycle.

## Example Usage

```typescript
import { BillingUpdateOnIncrease } from "@useautumn/sdk";

let value: BillingUpdateOnIncrease = "bill_next_cycle";
```

## Values

```typescript
"bill_immediately" | "prorate_immediately" | "prorate_next_cycle" | "bill_next_cycle"
```