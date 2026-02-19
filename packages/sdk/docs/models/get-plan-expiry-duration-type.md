# GetPlanExpiryDurationType

When rolled over units expire.

## Example Usage

```typescript
import { GetPlanExpiryDurationType } from "@useautumn/sdk";

let value: GetPlanExpiryDurationType = "month";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"month" | "forever" | Unrecognized<string>
```