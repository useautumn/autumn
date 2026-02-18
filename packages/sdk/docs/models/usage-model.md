# UsageModel

## Example Usage

```typescript
import { UsageModel } from "@useautumn/sdk";

let value: UsageModel = "prepaid";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "pay_per_use" | Unrecognized<string>
```