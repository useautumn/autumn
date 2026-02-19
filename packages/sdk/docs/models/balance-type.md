# BalanceType

Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.

## Example Usage

```typescript
import { BalanceType } from "@useautumn/sdk";

let value: BalanceType = "credit_system";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```