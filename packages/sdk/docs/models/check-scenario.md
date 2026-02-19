# CheckScenario

The reason access was denied. 'usage_limit' means the customer exceeded their balance, 'feature_flag' means the feature is not included in their plan.

## Example Usage

```typescript
import { CheckScenario } from "@useautumn/sdk";

let value: CheckScenario = "usage_limit";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"usage_limit" | "feature_flag" | Unrecognized<string>
```