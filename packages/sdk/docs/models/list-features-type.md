# ListFeaturesType

Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.

## Example Usage

```typescript
import { ListFeaturesType } from "@useautumn/sdk";

let value: ListFeaturesType = "boolean";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"boolean" | "metered" | "credit_system" | Unrecognized<string>
```