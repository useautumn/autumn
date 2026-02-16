# CustomerEnv

## Example Usage

```typescript
import { CustomerEnv } from "@useautumn/sdk";

let value: CustomerEnv = "sandbox";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```