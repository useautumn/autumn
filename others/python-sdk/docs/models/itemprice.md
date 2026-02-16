# ItemPrice


## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `amount`                                                   | *Optional[float]*                                          | :heavy_minus_sign:                                         | N/A                                                        |
| `tiers`                                                    | List[[models.PlanTier](../models/plantier.md)]             | :heavy_minus_sign:                                         | N/A                                                        |
| `interval`                                                 | [models.PriceItemInterval](../models/priceiteminterval.md) | :heavy_check_mark:                                         | N/A                                                        |
| `interval_count`                                           | *Optional[float]*                                          | :heavy_minus_sign:                                         | N/A                                                        |
| `billing_units`                                            | *float*                                                    | :heavy_check_mark:                                         | N/A                                                        |
| `billing_method`                                           | [models.PlanBillingMethod](../models/planbillingmethod.md) | :heavy_check_mark:                                         | N/A                                                        |
| `max_purchase`                                             | *Nullable[float]*                                          | :heavy_check_mark:                                         | N/A                                                        |