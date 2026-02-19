# CreatePlanEnv

Environment this plan belongs to ('sandbox' or 'live').

## Example Usage

```typescript
import { CreatePlanEnv } from "@useautumn/sdk";

let value: CreatePlanEnv = "sandbox";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```