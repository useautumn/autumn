# UpdatePlanEnv

Environment this plan belongs to ('sandbox' or 'live').

## Example Usage

```typescript
import { UpdatePlanEnv } from "@useautumn/sdk";

let value: UpdatePlanEnv = "live";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```