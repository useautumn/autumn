# GetPlanEnv

Environment this plan belongs to ('sandbox' or 'live').

## Example Usage

```typescript
import { GetPlanEnv } from "@useautumn/sdk";

let value: GetPlanEnv = "sandbox";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```