# ListCustomersStatus

## Example Usage

```typescript
import { ListCustomersStatus } from "@useautumn/sdk";

let value: ListCustomersStatus = "expired";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"active" | "scheduled" | "expired" | Unrecognized<string>
```