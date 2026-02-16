# CustomerPrice


## Fields

| Field                                                              | Type                                                               | Required                                                           | Description                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `amount`                                                           | *Optional[float]*                                                  | :heavy_minus_sign:                                                 | N/A                                                                |
| `tiers`                                                            | List[[models.CustomerTier](../models/customertier.md)]             | :heavy_minus_sign:                                                 | N/A                                                                |
| `billing_units`                                                    | *float*                                                            | :heavy_check_mark:                                                 | N/A                                                                |
| `billing_method`                                                   | [models.CustomerBillingMethod](../models/customerbillingmethod.md) | :heavy_check_mark:                                                 | N/A                                                                |
| `max_purchase`                                                     | *Nullable[float]*                                                  | :heavy_check_mark:                                                 | N/A                                                                |