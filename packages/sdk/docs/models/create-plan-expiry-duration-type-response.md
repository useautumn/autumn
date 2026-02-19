# CreatePlanExpiryDurationTypeResponse

When rolled over units expire.

## Example Usage

```typescript
import { CreatePlanExpiryDurationTypeResponse } from "@useautumn/sdk";

let value: CreatePlanExpiryDurationTypeResponse = "forever";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"month" | "forever" | Unrecognized<string>
```