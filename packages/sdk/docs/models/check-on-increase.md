# CheckOnIncrease

## Example Usage

```typescript
import { CheckOnIncrease } from "@useautumn/sdk";

let value: CheckOnIncrease = "prorate_immediately";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"bill_immediately" | "prorate_immediately" | "prorate_next_cycle" | "bill_next_cycle" | Unrecognized<string>
```