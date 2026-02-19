# GetEntityType

## Example Usage

```typescript
import { GetEntityType } from "@useautumn/sdk";

let value: GetEntityType = "boolean";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```