# CreatePlanRolloverResponse

Rollover configuration for unused units. If set, unused included units roll over to the next period.

## Example Usage

```typescript
import { CreatePlanRolloverResponse } from "@useautumn/sdk";

let value: CreatePlanRolloverResponse = {
  max: 5790.26,
  expiryDurationType: "forever",
};
```

## Fields

| Field                                                                                                 | Type                                                                                                  | Required                                                                                              | Description                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `max`                                                                                                 | *number*                                                                                              | :heavy_check_mark:                                                                                    | Maximum rollover units. Null for unlimited rollover.                                                  |
| `expiryDurationType`                                                                                  | [models.CreatePlanExpiryDurationTypeResponse](../models/create-plan-expiry-duration-type-response.md) | :heavy_check_mark:                                                                                    | When rolled over units expire.                                                                        |
| `expiryDurationLength`                                                                                | *number*                                                                                              | :heavy_minus_sign:                                                                                    | Number of periods before expiry.                                                                      |