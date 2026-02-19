# CreatePlanOnIncrease

Billing behavior when quantity increases mid-cycle.

## Example Usage

```typescript
import { CreatePlanOnIncrease } from "@useautumn/sdk";

let value: CreatePlanOnIncrease = "bill_immediately";
```

## Values

```typescript
"bill_immediately" | "prorate_immediately" | "prorate_next_cycle" | "bill_next_cycle"
```