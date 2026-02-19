# GetPlanType

The type of the feature

## Example Usage

```typescript
import { GetPlanType } from "@useautumn/sdk";

let value: GetPlanType = "boolean";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"static" | "boolean" | "single_use" | "continuous_use" | "credit_system" | Unrecognized<string>
```