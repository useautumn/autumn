# TrackBalancesType

## Example Usage

```typescript
import { TrackBalancesType } from "@useautumn/sdk";

let value: TrackBalancesType = "boolean";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```