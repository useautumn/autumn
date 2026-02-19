# CreateEntityType

## Example Usage

```typescript
import { CreateEntityType } from "@useautumn/sdk";

let value: CreateEntityType = "boolean";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```