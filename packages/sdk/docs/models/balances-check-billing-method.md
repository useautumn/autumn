# BalancesCheckBillingMethod

## Example Usage

```typescript
import { BalancesCheckBillingMethod } from "@useautumn/sdk";

let value: BalancesCheckBillingMethod = "prepaid";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "usage_based" | Unrecognized<string>
```