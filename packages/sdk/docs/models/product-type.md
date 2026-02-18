# ProductType

## Example Usage

```typescript
import { ProductType } from "@useautumn/sdk";

let value: ProductType = "priced_feature";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"feature" | "priced_feature" | "price" | Unrecognized<string>
```