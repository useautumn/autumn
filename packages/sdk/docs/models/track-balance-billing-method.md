# TrackBalanceBillingMethod

Whether usage is prepaid or billed pay-per-use.

## Example Usage

```typescript
import { TrackBalanceBillingMethod } from "@useautumn/sdk";

let value: TrackBalanceBillingMethod = "usage_based";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "usage_based" | Unrecognized<string>
```