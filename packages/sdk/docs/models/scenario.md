# Scenario

## Example Usage

```typescript
import { Scenario } from "@useautumn/sdk";

let value: Scenario = "active";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"scheduled" | "active" | "new" | "renew" | "upgrade" | "downgrade" | "cancel" | "expired" | "past_due" | Unrecognized<string>
```