# GetPlanPriceInterval

Billing interval (e.g. 'month', 'year').

## Example Usage

```typescript
import { GetPlanPriceInterval } from "@useautumn/sdk";

let value: GetPlanPriceInterval = "one_off";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```