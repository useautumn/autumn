# IncomingType

## Example Usage

```typescript
import { IncomingType } from "@useautumn/sdk";

let value: IncomingType = "credit_system";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```