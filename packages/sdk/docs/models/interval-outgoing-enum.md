# IntervalOutgoingEnum

## Example Usage

```typescript
import { IntervalOutgoingEnum } from "@useautumn/sdk";

let value: IntervalOutgoingEnum = "quarter";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```