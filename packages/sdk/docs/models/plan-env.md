# PlanEnv

## Example Usage

```typescript
import { PlanEnv } from "@useautumn/sdk";

let value: PlanEnv = "live";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```