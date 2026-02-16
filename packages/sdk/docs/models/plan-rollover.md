# PlanRollover

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
| `max`                                                          | *number*                                                       | :heavy_check_mark:                                             | N/A                                                            |
| `expiryDurationType`                                           | [models.ExpiryDurationType](../models/expiry-duration-type.md) | :heavy_check_mark:                                             | N/A                                                            |
| `expiryDurationLength`                                         | *number*                                                       | :heavy_minus_sign:                                             | N/A                                                            |