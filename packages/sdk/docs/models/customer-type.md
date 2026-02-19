# CustomerType

The type of reward

## Example Usage

```typescript
import { CustomerType } from "@useautumn/sdk";

let value: CustomerType = "fixed_discount";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"percentage_discount" | "fixed_discount" | "free_product" | "invoice_credits" | Unrecognized<string>
```