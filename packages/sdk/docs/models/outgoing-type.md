# OutgoingType

## Example Usage

```typescript
import { OutgoingType } from "@useautumn/sdk";

let value: OutgoingType = "credit_system";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```