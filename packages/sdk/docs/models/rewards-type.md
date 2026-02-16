# RewardsType

The type of reward

## Example Usage

```typescript
import { RewardsType } from "@useautumn/sdk";

let value: RewardsType = "free_product";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"percentage_discount" | "fixed_discount" | "free_product" | "invoice_credits" | Unrecognized<string>
```