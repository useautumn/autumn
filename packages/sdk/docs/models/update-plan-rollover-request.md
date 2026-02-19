# UpdatePlanRolloverRequest

Rollover config for unused units. If set, unused included units carry over.

## Example Usage

```typescript
import { UpdatePlanRolloverRequest } from "@useautumn/sdk";

let value: UpdatePlanRolloverRequest = {
  expiryDurationType: "forever",
};
```

## Fields

| Field                                                                                               | Type                                                                                                | Required                                                                                            | Description                                                                                         |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `max`                                                                                               | *number*                                                                                            | :heavy_minus_sign:                                                                                  | Max rollover units. Omit for unlimited rollover.                                                    |
| `expiryDurationType`                                                                                | [models.UpdatePlanExpiryDurationTypeRequest](../models/update-plan-expiry-duration-type-request.md) | :heavy_check_mark:                                                                                  | When rolled over units expire.                                                                      |
| `expiryDurationLength`                                                                              | *number*                                                                                            | :heavy_minus_sign:                                                                                  | Number of periods before expiry.                                                                    |