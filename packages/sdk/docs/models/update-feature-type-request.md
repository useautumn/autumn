# UpdateFeatureTypeRequest

The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.

## Example Usage

```typescript
import { UpdateFeatureTypeRequest } from "@useautumn/sdk";

let value: UpdateFeatureTypeRequest = "credit_system";
```

## Values

```typescript
"boolean" | "metered" | "credit_system"
```