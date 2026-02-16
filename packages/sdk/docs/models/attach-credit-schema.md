# AttachCreditSchema

## Example Usage

```typescript
import { AttachCreditSchema } from "@useautumn/sdk";

let value: AttachCreditSchema = {
  meteredFeatureId: "<id>",
  creditCost: 3433.52,
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `meteredFeatureId`                                              | *string*                                                        | :heavy_check_mark:                                              | The ID of the metered feature (should be a single_use feature). |
| `creditCost`                                                    | *number*                                                        | :heavy_check_mark:                                              | The credit cost of the metered feature.                         |