# BalancesCheckEnv

The environment of the product

## Example Usage

```typescript
import { BalancesCheckEnv } from "@useautumn/sdk";

let value: BalancesCheckEnv = "sandbox";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```