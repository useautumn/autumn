# CreatePlanCreditSchema

## Example Usage

```typescript
import { CreatePlanCreditSchema } from "@useautumn/sdk";

let value: CreatePlanCreditSchema = {
  meteredFeatureId: "<id>",
  creditCost: 4035.58,
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `meteredFeatureId`                                              | *string*                                                        | :heavy_check_mark:                                              | The ID of the metered feature (should be a single_use feature). |
| `creditCost`                                                    | *number*                                                        | :heavy_check_mark:                                              | The credit cost of the metered feature.                         |