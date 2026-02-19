# BillingAttachRollover

Rollover config for unused units. If set, unused included units carry over.

## Example Usage

```typescript
import { BillingAttachRollover } from "@useautumn/sdk";

let value: BillingAttachRollover = {
  expiryDurationType: "forever",
};
```

## Fields

| Field                                                                                      | Type                                                                                       | Required                                                                                   | Description                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `max`                                                                                      | *number*                                                                                   | :heavy_minus_sign:                                                                         | Max rollover units. Omit for unlimited rollover.                                           |
| `expiryDurationType`                                                                       | [models.BillingAttachExpiryDurationType](../models/billing-attach-expiry-duration-type.md) | :heavy_check_mark:                                                                         | When rolled over units expire.                                                             |
| `expiryDurationLength`                                                                     | *number*                                                                                   | :heavy_minus_sign:                                                                         | Number of periods before expiry.                                                           |