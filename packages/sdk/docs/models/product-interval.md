# ProductInterval

## Example Usage

```typescript
import { ProductInterval } from "@useautumn/sdk";

let value: ProductInterval = "minute";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```