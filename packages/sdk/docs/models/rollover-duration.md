# RolloverDuration

## Example Usage

```typescript
import { RolloverDuration } from "@useautumn/sdk";

let value: RolloverDuration = "forever";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"month" | "forever" | Unrecognized<string>
```