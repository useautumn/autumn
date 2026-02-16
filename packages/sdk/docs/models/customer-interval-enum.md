# CustomerIntervalEnum

## Example Usage

```typescript
import { CustomerIntervalEnum } from "@useautumn/sdk";

let value: CustomerIntervalEnum = "day";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```