# ListPlansPriceInterval

Billing interval (e.g. 'month', 'year').

## Example Usage

```typescript
import { ListPlansPriceInterval } from "@useautumn/sdk";

let value: ListPlansPriceInterval = "one_off";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```