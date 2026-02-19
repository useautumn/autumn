# PreviewAttachPrice


## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `amount`                                                                     | *float*                                                                      | :heavy_check_mark:                                                           | Base price amount for the plan.                                              |
| `interval`                                                                   | [models.PreviewAttachPriceInterval](../models/previewattachpriceinterval.md) | :heavy_check_mark:                                                           | Billing interval (e.g. 'month', 'year').                                     |
| `interval_count`                                                             | *Optional[float]*                                                            | :heavy_minus_sign:                                                           | Number of intervals per billing cycle. Defaults to 1.                        |