# UpdateCustomerStatus

## Example Usage

```typescript
import { UpdateCustomerStatus } from "@useautumn/sdk";

let value: UpdateCustomerStatus = "active";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"active" | "scheduled" | "expired" | Unrecognized<string>
```