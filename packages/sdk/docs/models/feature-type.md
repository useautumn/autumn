# FeatureType

## Example Usage

```typescript
import { FeatureType } from "@useautumn/sdk";

let value: FeatureType = "continuous_use";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"single_use" | "continuous_use" | "boolean" | "static" | Unrecognized<string>
```