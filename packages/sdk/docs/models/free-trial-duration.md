# FreeTrialDuration

The duration type of the free trial

## Example Usage

```typescript
import { FreeTrialDuration } from "@useautumn/sdk";

let value: FreeTrialDuration = "month";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"day" | "month" | "year" | Unrecognized<string>
```