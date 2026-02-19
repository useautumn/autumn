# CreatePlanOnDecrease

Credit behavior when quantity decreases mid-cycle.

## Example Usage

```typescript
import { CreatePlanOnDecrease } from "@useautumn/sdk";

let value: CreatePlanOnDecrease = "prorate_immediately";
```

## Values

```typescript
"prorate" | "prorate_immediately" | "prorate_next_cycle" | "none" | "no_prorations"
```