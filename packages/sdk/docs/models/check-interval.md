# CheckInterval

## Example Usage

```typescript
import { CheckInterval } from "@useautumn/sdk";

let value: CheckInterval = "hour";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year" | Unrecognized<string>
```