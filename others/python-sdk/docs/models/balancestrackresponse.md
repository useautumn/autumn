# BalancesTrackResponse

OK


## Fields

| Field                                                                         | Type                                                                          | Required                                                                      | Description                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `customer_id`                                                                 | *str*                                                                         | :heavy_check_mark:                                                            | The ID of the customer                                                        |
| `entity_id`                                                                   | *Optional[str]*                                                               | :heavy_minus_sign:                                                            | The ID of the entity (if provided)                                            |
| `event_name`                                                                  | *Optional[str]*                                                               | :heavy_minus_sign:                                                            | The name of the event                                                         |
| `value`                                                                       | *float*                                                                       | :heavy_check_mark:                                                            | N/A                                                                           |
| `balance`                                                                     | [Nullable[models.BalancesTrackBalance]](../models/balancestrackbalance.md)    | :heavy_check_mark:                                                            | N/A                                                                           |
| `balances`                                                                    | Dict[str, [models.BalancesTrackBalances](../models/balancestrackbalances.md)] | :heavy_minus_sign:                                                            | N/A                                                                           |