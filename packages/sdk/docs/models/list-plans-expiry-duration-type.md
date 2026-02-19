# ListPlansExpiryDurationType

When rolled over units expire.

## Example Usage

```typescript
import { ListPlansExpiryDurationType } from "@useautumn/sdk";

let value: ListPlansExpiryDurationType = "forever";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"month" | "forever" | Unrecognized<string>
```