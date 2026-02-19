# BalanceIntervalEnum

## Example Usage

```typescript
import { BalanceIntervalEnum } from "@useautumn/sdk";

let value: BalanceIntervalEnum = "hour";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```