# CustomerBalancesType

## Example Usage

```typescript
import { CustomerBalancesType } from "@useautumn/sdk";

let value: CustomerBalancesType = "boolean";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```