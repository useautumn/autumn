# Status

## Example Usage

```typescript
import { Status } from "@useautumn/sdk";

let value: Status = "scheduled";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"active" | "scheduled" | "expired" | Unrecognized<string>
```