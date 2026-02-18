# OutgoingBillingMethod

## Example Usage

```typescript
import { OutgoingBillingMethod } from "@useautumn/sdk";

let value: OutgoingBillingMethod = "prepaid";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "usage_based" | Unrecognized<string>
```