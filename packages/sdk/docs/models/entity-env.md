# EntityEnv

The environment (sandbox/live)

## Example Usage

```typescript
import { EntityEnv } from "@useautumn/sdk";

let value: EntityEnv = "live";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```