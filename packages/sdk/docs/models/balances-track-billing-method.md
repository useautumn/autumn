# BalancesTrackBillingMethod

## Example Usage

```typescript
import { BalancesTrackBillingMethod } from "@useautumn/sdk";

let value: BalancesTrackBillingMethod = "prepaid";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "usage_based" | Unrecognized<string>
```