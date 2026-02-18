# BalancesCheckResponse

OK


## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `allowed`                                                                  | *bool*                                                                     | :heavy_check_mark:                                                         | N/A                                                                        |
| `customer_id`                                                              | *str*                                                                      | :heavy_check_mark:                                                         | N/A                                                                        |
| `entity_id`                                                                | *OptionalNullable[str]*                                                    | :heavy_minus_sign:                                                         | N/A                                                                        |
| `required_balance`                                                         | *Optional[float]*                                                          | :heavy_minus_sign:                                                         | N/A                                                                        |
| `balance`                                                                  | [Nullable[models.BalancesCheckBalance]](../models/balancescheckbalance.md) | :heavy_check_mark:                                                         | N/A                                                                        |
| `preview`                                                                  | [Optional[models.Preview]](../models/preview.md)                           | :heavy_minus_sign:                                                         | N/A                                                                        |