# ListPlansEnv

Environment this plan belongs to ('sandbox' or 'live').

## Example Usage

```typescript
import { ListPlansEnv } from "@useautumn/sdk";

let value: ListPlansEnv = "live";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```