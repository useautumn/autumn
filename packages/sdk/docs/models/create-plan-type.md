# CreatePlanType

The type of the feature

## Example Usage

```typescript
import { CreatePlanType } from "@useautumn/sdk";

let value: CreatePlanType = "boolean";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"static" | "boolean" | "single_use" | "continuous_use" | "credit_system" | Unrecognized<string>
```