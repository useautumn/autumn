# BillingAttachResetInterval

Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.

## Example Usage

```typescript
import { BillingAttachResetInterval } from "@useautumn/sdk";

let value: BillingAttachResetInterval = "month";
```

## Values

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year"
```