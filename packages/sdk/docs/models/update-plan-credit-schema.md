# UpdatePlanCreditSchema

## Example Usage

```typescript
import { UpdatePlanCreditSchema } from "@useautumn/sdk";

let value: UpdatePlanCreditSchema = {
  meteredFeatureId: "<id>",
  creditCost: 9878.94,
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `meteredFeatureId`                                              | *string*                                                        | :heavy_check_mark:                                              | The ID of the metered feature (should be a single_use feature). |
| `creditCost`                                                    | *number*                                                        | :heavy_check_mark:                                              | The credit cost of the metered feature.                         |