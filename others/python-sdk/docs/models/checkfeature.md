# CheckFeature

The full feature object if expanded.


## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `id`                                                                     | *str*                                                                    | :heavy_check_mark:                                                       | N/A                                                                      |
| `name`                                                                   | *str*                                                                    | :heavy_check_mark:                                                       | N/A                                                                      |
| `type`                                                                   | [models.CheckBalanceType](../models/checkbalancetype.md)                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `consumable`                                                             | *bool*                                                                   | :heavy_check_mark:                                                       | N/A                                                                      |
| `event_names`                                                            | List[*str*]                                                              | :heavy_minus_sign:                                                       | N/A                                                                      |
| `credit_schema`                                                          | List[[models.CheckCreditSchema](../models/checkcreditschema.md)]         | :heavy_minus_sign:                                                       | N/A                                                                      |
| `display`                                                                | [Optional[models.CheckBalanceDisplay]](../models/checkbalancedisplay.md) | :heavy_minus_sign:                                                       | N/A                                                                      |
| `archived`                                                               | *bool*                                                                   | :heavy_check_mark:                                                       | N/A                                                                      |