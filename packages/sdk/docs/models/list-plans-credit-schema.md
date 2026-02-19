# ListPlansCreditSchema

## Example Usage

```typescript
import { ListPlansCreditSchema } from "@useautumn/sdk";

let value: ListPlansCreditSchema = {
  meteredFeatureId: "<id>",
  creditCost: 7196.78,
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `meteredFeatureId`                                              | *string*                                                        | :heavy_check_mark:                                              | The ID of the metered feature (should be a single_use feature). |
| `creditCost`                                                    | *number*                                                        | :heavy_check_mark:                                              | The credit cost of the metered feature.                         |