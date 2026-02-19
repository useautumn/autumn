# GetEntityStatus

Current status of the subscription.

## Example Usage

```typescript
import { GetEntityStatus } from "@useautumn/sdk";

let value: GetEntityStatus = "scheduled";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"active" | "scheduled" | Unrecognized<string>
```