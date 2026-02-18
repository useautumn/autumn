# Item


## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `feature_id`                                                     | *str*                                                            | :heavy_check_mark:                                               | N/A                                                              |
| `feature`                                                        | [Optional[models.PlanFeature]](../models/planfeature.md)         | :heavy_minus_sign:                                               | N/A                                                              |
| `included`                                                       | *float*                                                          | :heavy_check_mark:                                               | N/A                                                              |
| `unlimited`                                                      | *bool*                                                           | :heavy_check_mark:                                               | N/A                                                              |
| `reset`                                                          | [Nullable[models.PlanReset]](../models/planreset.md)             | :heavy_check_mark:                                               | N/A                                                              |
| `price`                                                          | [Nullable[models.PlanItemPrice]](../models/planitemprice.md)     | :heavy_check_mark:                                               | N/A                                                              |
| `display`                                                        | [Optional[models.PlanItemDisplay]](../models/planitemdisplay.md) | :heavy_minus_sign:                                               | N/A                                                              |
| `rollover`                                                       | [Optional[models.PlanRollover]](../models/planrollover.md)       | :heavy_minus_sign:                                               | N/A                                                              |
| `proration`                                                      | [Optional[models.Proration]](../models/proration.md)             | :heavy_minus_sign:                                               | N/A                                                              |