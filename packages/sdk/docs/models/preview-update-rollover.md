# PreviewUpdateRollover

Rollover config for unused units. If set, unused included units carry over.

## Example Usage

```typescript
import { PreviewUpdateRollover } from "@useautumn/sdk";

let value: PreviewUpdateRollover = {
  expiryDurationType: "month",
};
```

## Fields

| Field                                                                                      | Type                                                                                       | Required                                                                                   | Description                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `max`                                                                                      | *number*                                                                                   | :heavy_minus_sign:                                                                         | Max rollover units. Omit for unlimited rollover.                                           |
| `expiryDurationType`                                                                       | [models.PreviewUpdateExpiryDurationType](../models/preview-update-expiry-duration-type.md) | :heavy_check_mark:                                                                         | When rolled over units expire.                                                             |
| `expiryDurationLength`                                                                     | *number*                                                                                   | :heavy_minus_sign:                                                                         | Number of periods before expiry.                                                           |