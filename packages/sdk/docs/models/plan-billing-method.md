# PlanBillingMethod

## Example Usage

```typescript
import { PlanBillingMethod } from "@useautumn/sdk";

let value: PlanBillingMethod = "usage_based";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "usage_based" | Unrecognized<string>
```