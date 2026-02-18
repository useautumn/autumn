# IncomingPrice


## Fields

| Field                                                              | Type                                                               | Required                                                           | Description                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `amount`                                                           | *Optional[float]*                                                  | :heavy_minus_sign:                                                 | N/A                                                                |
| `tiers`                                                            | List[[models.IncomingTier](../models/incomingtier.md)]             | :heavy_minus_sign:                                                 | N/A                                                                |
| `billing_units`                                                    | *float*                                                            | :heavy_check_mark:                                                 | N/A                                                                |
| `billing_method`                                                   | [models.IncomingBillingMethod](../models/incomingbillingmethod.md) | :heavy_check_mark:                                                 | N/A                                                                |
| `max_purchase`                                                     | *Nullable[float]*                                                  | :heavy_check_mark:                                                 | N/A                                                                |