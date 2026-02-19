# CheckType

## Example Usage

```typescript
import { CheckType } from "@useautumn/sdk";

let value: CheckType = "price";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"feature" | "priced_feature" | "price" | Unrecognized<string>
```