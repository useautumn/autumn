# GetFeatureCreditSchema

## Example Usage

```typescript
import { GetFeatureCreditSchema } from "@useautumn/sdk";

let value: GetFeatureCreditSchema = {
  meteredFeatureId: "<id>",
  creditCost: 1099.1,
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `meteredFeatureId`                                            | *string*                                                      | :heavy_check_mark:                                            | ID of the metered feature that draws from this credit system. |
| `creditCost`                                                  | *number*                                                      | :heavy_check_mark:                                            | Credits consumed per unit of the metered feature.             |