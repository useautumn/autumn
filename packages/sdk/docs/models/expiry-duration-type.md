# ExpiryDurationType

When rolled over units expire.

## Example Usage

```typescript
import { ExpiryDurationType } from "@useautumn/sdk";

let value: ExpiryDurationType = "month";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"month" | "forever" | Unrecognized<string>
```