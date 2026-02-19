# CreateEntityEnv

The environment (sandbox/live)

## Example Usage

```typescript
import { CreateEntityEnv } from "@useautumn/sdk";

let value: CreateEntityEnv = "sandbox";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```