# CreateBalanceInterval

The interval at which the balance resets (e.g., 'month', 'day', 'year').

## Example Usage

```typescript
import { CreateBalanceInterval } from "@useautumn/sdk";

let value: CreateBalanceInterval = "semi_annual";
```

## Values

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year"
```