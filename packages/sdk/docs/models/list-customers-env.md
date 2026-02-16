# ListCustomersEnv

The environment this customer was created in.

## Example Usage

```typescript
import { ListCustomersEnv } from "@useautumn/sdk";

let value: ListCustomersEnv = "live";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```