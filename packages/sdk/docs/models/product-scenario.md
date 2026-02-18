# ProductScenario

Scenario for when this product is used in attach flows

## Example Usage

```typescript
import { ProductScenario } from "@useautumn/sdk";

let value: ProductScenario = "renew";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"scheduled" | "active" | "new" | "renew" | "upgrade" | "downgrade" | "cancel" | "expired" | "past_due" | Unrecognized<string>
```