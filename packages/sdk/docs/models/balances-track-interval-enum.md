# BalancesTrackIntervalEnum

## Example Usage

```typescript
import { BalancesTrackIntervalEnum } from "@useautumn/sdk";

let value: BalancesTrackIntervalEnum = "hour";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```