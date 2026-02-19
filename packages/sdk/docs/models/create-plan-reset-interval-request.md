# CreatePlanResetIntervalRequest

Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.

## Example Usage

```typescript
import { CreatePlanResetIntervalRequest } from "@useautumn/sdk";

let value: CreatePlanResetIntervalRequest = "year";
```

## Values

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year"
```