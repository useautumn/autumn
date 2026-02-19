# CheckBalanceType

## Example Usage

```typescript
import { CheckBalanceType } from "@useautumn/sdk";

let value: CheckBalanceType = "boolean";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```