# UpdatePlanOnIncrease

Billing behavior when quantity increases mid-cycle.

## Example Usage

```typescript
import { UpdatePlanOnIncrease } from "@useautumn/sdk";

let value: UpdatePlanOnIncrease = "bill_next_cycle";
```

## Values

```typescript
"bill_immediately" | "prorate_immediately" | "prorate_next_cycle" | "bill_next_cycle"
```