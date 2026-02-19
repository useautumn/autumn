# BillingUpdateOnDecrease

Credit behavior when quantity decreases mid-cycle.

## Example Usage

```typescript
import { BillingUpdateOnDecrease } from "@useautumn/sdk";

let value: BillingUpdateOnDecrease = "prorate_next_cycle";
```

## Values

```typescript
"prorate" | "prorate_immediately" | "prorate_next_cycle" | "none" | "no_prorations"
```