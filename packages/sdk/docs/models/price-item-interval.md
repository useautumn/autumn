# PriceItemInterval

## Example Usage

```typescript
import { PriceItemInterval } from "@useautumn/sdk";

let value: PriceItemInterval = "month";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```