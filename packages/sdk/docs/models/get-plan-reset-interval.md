# GetPlanResetInterval

The interval at which the feature balance resets (e.g. 'month', 'year'). For consumable features, usage resets to 0 and included units are restored.

## Example Usage

```typescript
import { GetPlanResetInterval } from "@useautumn/sdk";

let value: GetPlanResetInterval = "semi_annual";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```