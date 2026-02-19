# CreatePlanItemPriceIntervalRequest

Billing interval. For consumable features, should match reset.interval.

## Example Usage

```typescript
import { CreatePlanItemPriceIntervalRequest } from "@useautumn/sdk";

let value: CreatePlanItemPriceIntervalRequest = "month";
```

## Values

```typescript
"one_off" | "week" | "month" | "quarter" | "semi_annual" | "year"
```