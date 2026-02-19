# ListPlansRollover

Rollover configuration for unused units. If set, unused included units roll over to the next period.


## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `max`                                                                          | *Nullable[float]*                                                              | :heavy_check_mark:                                                             | Maximum rollover units. Null for unlimited rollover.                           |
| `expiry_duration_type`                                                         | [models.ListPlansExpiryDurationType](../models/listplansexpirydurationtype.md) | :heavy_check_mark:                                                             | When rolled over units expire.                                                 |
| `expiry_duration_length`                                                       | *Optional[float]*                                                              | :heavy_minus_sign:                                                             | Number of periods before expiry.                                               |