# UpdatePlanRolloverResponse

Rollover configuration for unused units. If set, unused included units roll over to the next period.

## Example Usage

```typescript
import { UpdatePlanRolloverResponse } from "@useautumn/sdk";

let value: UpdatePlanRolloverResponse = {
  max: 7363.87,
  expiryDurationType: "month",
};
```

## Fields

| Field                                                                                                 | Type                                                                                                  | Required                                                                                              | Description                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `max`                                                                                                 | *number*                                                                                              | :heavy_check_mark:                                                                                    | Maximum rollover units. Null for unlimited rollover.                                                  |
| `expiryDurationType`                                                                                  | [models.UpdatePlanExpiryDurationTypeResponse](../models/update-plan-expiry-duration-type-response.md) | :heavy_check_mark:                                                                                    | When rolled over units expire.                                                                        |
| `expiryDurationLength`                                                                                | *number*                                                                                              | :heavy_minus_sign:                                                                                    | Number of periods before expiry.                                                                      |