# UpdatePlanBillingMethodResponse

'prepaid' for features like seats where customers pay upfront, 'usage_based' for pay-as-you-go after included usage.

## Example Usage

```typescript
import { UpdatePlanBillingMethodResponse } from "@useautumn/sdk";

let value: UpdatePlanBillingMethodResponse = "usage_based";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"prepaid" | "usage_based" | Unrecognized<string>
```