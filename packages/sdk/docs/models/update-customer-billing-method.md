# UpdateCustomerBillingMethod

Whether usage is prepaid or billed pay-per-use.

## Example Usage

```typescript
import { UpdateCustomerBillingMethod } from "@useautumn/sdk";

let value: UpdateCustomerBillingMethod = "usage_based";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "usage_based" | Unrecognized<string>
```