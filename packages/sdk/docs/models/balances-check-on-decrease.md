# BalancesCheckOnDecrease

## Example Usage

```typescript
import { BalancesCheckOnDecrease } from "@useautumn/sdk";

let value: BalancesCheckOnDecrease = "prorate_next_cycle";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prorate" | "prorate_immediately" | "prorate_next_cycle" | "none" | "no_prorations" | Unrecognized<string>
```