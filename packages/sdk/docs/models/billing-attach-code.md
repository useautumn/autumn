# BillingAttachCode

The type of action required to complete the payment.

## Example Usage

```typescript
import { BillingAttachCode } from "@useautumn/sdk";

let value: BillingAttachCode = "3ds_required";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"3ds_required" | "payment_method_required" | "payment_failed" | Unrecognized<string>
```