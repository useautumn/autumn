# TrackIntervalBalancesEnum

## Example Usage

```typescript
import { TrackIntervalBalancesEnum } from "@useautumn/sdk";

let value: TrackIntervalBalancesEnum = "one_off";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```