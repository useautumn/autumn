# UpdateCustomerEnv

The environment this customer was created in.

## Example Usage

```typescript
import { UpdateCustomerEnv } from "@useautumn/sdk";

let value: UpdateCustomerEnv = "live";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```