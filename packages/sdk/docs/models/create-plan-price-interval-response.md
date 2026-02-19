# CreatePlanPriceIntervalResponse

Billing interval (e.g. 'month', 'year').

## Example Usage

```typescript
import { CreatePlanPriceIntervalResponse } from "@useautumn/sdk";

let value: CreatePlanPriceIntervalResponse = "month";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```