# BillingAttachRollover

Rollover config for unused units. If set, unused included units carry over.


## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `max`                                                                                  | *Optional[float]*                                                                      | :heavy_minus_sign:                                                                     | Max rollover units. Omit for unlimited rollover.                                       |
| `expiry_duration_type`                                                                 | [models.BillingAttachExpiryDurationType](../models/billingattachexpirydurationtype.md) | :heavy_check_mark:                                                                     | When rolled over units expire.                                                         |
| `expiry_duration_length`                                                               | *Optional[float]*                                                                      | :heavy_minus_sign:                                                                     | Number of periods before expiry.                                                       |