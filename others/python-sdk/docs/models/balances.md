# Balances


## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `feature_id`                                                   | *str*                                                          | :heavy_check_mark:                                             | N/A                                                            |
| `granted`                                                      | *float*                                                        | :heavy_check_mark:                                             | N/A                                                            |
| `remaining`                                                    | *float*                                                        | :heavy_check_mark:                                             | N/A                                                            |
| `usage`                                                        | *float*                                                        | :heavy_check_mark:                                             | N/A                                                            |
| `unlimited`                                                    | *bool*                                                         | :heavy_check_mark:                                             | N/A                                                            |
| `overage_allowed`                                              | *bool*                                                         | :heavy_check_mark:                                             | N/A                                                            |
| `max_purchase`                                                 | *Nullable[float]*                                              | :heavy_check_mark:                                             | N/A                                                            |
| `next_reset_at`                                                | *Nullable[float]*                                              | :heavy_check_mark:                                             | N/A                                                            |
| `breakdown`                                                    | List[[models.Breakdown](../models/breakdown.md)]               | :heavy_minus_sign:                                             | N/A                                                            |
| `rollovers`                                                    | List[[models.CustomerRollover](../models/customerrollover.md)] | :heavy_minus_sign:                                             | N/A                                                            |