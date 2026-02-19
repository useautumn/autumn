# UpdateFeatureCreditSchemaResponse

## Example Usage

```typescript
import { UpdateFeatureCreditSchemaResponse } from "@useautumn/sdk";

let value: UpdateFeatureCreditSchemaResponse = {
  meteredFeatureId: "<id>",
  creditCost: 1942.85,
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `meteredFeatureId`                                            | *string*                                                      | :heavy_check_mark:                                            | ID of the metered feature that draws from this credit system. |
| `creditCost`                                                  | *number*                                                      | :heavy_check_mark:                                            | Credits consumed per unit of the metered feature.             |