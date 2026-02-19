# PlanPriceItemInterval

Billing interval for this price. For consumable features, should match reset.interval.

## Example Usage

```typescript
import { PlanPriceItemInterval } from "@useautumn/sdk";

let value: PlanPriceItemInterval = "year";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```