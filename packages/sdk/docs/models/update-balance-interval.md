# UpdateBalanceInterval

Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals.

## Example Usage

```typescript
import { UpdateBalanceInterval } from "@useautumn/sdk";

let value: UpdateBalanceInterval = "hour";
```

## Values

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year"
```