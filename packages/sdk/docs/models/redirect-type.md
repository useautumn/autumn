# RedirectType

## Example Usage

```typescript
import { RedirectType } from "@useautumn/sdk";

let value: RedirectType = "autumn_checkout";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"stripe_checkout" | "autumn_checkout" | Unrecognized<string>
```