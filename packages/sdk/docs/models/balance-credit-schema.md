# BalanceCreditSchema

## Example Usage

```typescript
import { BalanceCreditSchema } from "@useautumn/sdk";

let value: BalanceCreditSchema = {
  meteredFeatureId: "<id>",
  creditCost: 8293.55,
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `meteredFeatureId`                                            | *string*                                                      | :heavy_check_mark:                                            | ID of the metered feature that draws from this credit system. |
| `creditCost`                                                  | *number*                                                      | :heavy_check_mark:                                            | Credits consumed per unit of the metered feature.             |