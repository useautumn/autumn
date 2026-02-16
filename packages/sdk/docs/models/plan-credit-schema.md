# PlanCreditSchema

## Example Usage

```typescript
import { PlanCreditSchema } from "@useautumn/sdk";

let value: PlanCreditSchema = {
  meteredFeatureId: "<id>",
  creditCost: 2845.35,
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `meteredFeatureId`                                              | *string*                                                        | :heavy_check_mark:                                              | The ID of the metered feature (should be a single_use feature). |
| `creditCost`                                                    | *number*                                                        | :heavy_check_mark:                                              | The credit cost of the metered feature.                         |