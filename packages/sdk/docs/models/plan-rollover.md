# PlanRollover

Rollover configuration for unused units. If set, unused included units roll over to the next period.

## Example Usage

```typescript
import { PlanRollover } from "@useautumn/sdk";

let value: PlanRollover = {
  max: 3077.9,
  expiryDurationType: "forever",
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `max`                                                          | *number*                                                       | :heavy_check_mark:                                             | Maximum rollover units. Null for unlimited rollover.           |
| `expiryDurationType`                                           | [models.ExpiryDurationType](../models/expiry-duration-type.md) | :heavy_check_mark:                                             | When rolled over units expire.                                 |
| `expiryDurationLength`                                         | *number*                                                       | :heavy_minus_sign:                                             | Number of periods before expiry.                               |