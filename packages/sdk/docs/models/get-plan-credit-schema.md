# GetPlanCreditSchema

## Example Usage

```typescript
import { GetPlanCreditSchema } from "@useautumn/sdk";

let value: GetPlanCreditSchema = {
  meteredFeatureId: "<id>",
  creditCost: 5581.71,
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `meteredFeatureId`                                              | *string*                                                        | :heavy_check_mark:                                              | The ID of the metered feature (should be a single_use feature). |
| `creditCost`                                                    | *number*                                                        | :heavy_check_mark:                                              | The credit cost of the metered feature.                         |