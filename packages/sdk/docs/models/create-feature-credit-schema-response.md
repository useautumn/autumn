# CreateFeatureCreditSchemaResponse

## Example Usage

```typescript
import { CreateFeatureCreditSchemaResponse } from "@useautumn/sdk";

let value: CreateFeatureCreditSchemaResponse = {
  meteredFeatureId: "<id>",
  creditCost: 4435.58,
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `meteredFeatureId`                                            | *string*                                                      | :heavy_check_mark:                                            | ID of the metered feature that draws from this credit system. |
| `creditCost`                                                  | *number*                                                      | :heavy_check_mark:                                            | Credits consumed per unit of the metered feature.             |