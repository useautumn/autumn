# GetEntityEnv

The environment (sandbox/live)

## Example Usage

```typescript
import { GetEntityEnv } from "@useautumn/sdk";

let value: GetEntityEnv = "live";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```