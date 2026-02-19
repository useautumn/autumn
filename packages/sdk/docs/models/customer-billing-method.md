# CustomerBillingMethod

Whether usage is prepaid or billed pay-per-use.

## Example Usage

```typescript
import { CustomerBillingMethod } from "@useautumn/sdk";

let value: CustomerBillingMethod = "prepaid";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "usage_based" | Unrecognized<string>
```