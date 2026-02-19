# UpdatePlanPriceIntervalResponse

Billing interval (e.g. 'month', 'year').

## Example Usage

```typescript
import { UpdatePlanPriceIntervalResponse } from "@useautumn/sdk";

let value: UpdatePlanPriceIntervalResponse = "week";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```