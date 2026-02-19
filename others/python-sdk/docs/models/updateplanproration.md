# UpdatePlanProration

Proration settings for prepaid features. Controls mid-cycle quantity change billing.


## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `on_increase`                                                    | [models.UpdatePlanOnIncrease](../models/updateplanonincrease.md) | :heavy_check_mark:                                               | Billing behavior when quantity increases mid-cycle.              |
| `on_decrease`                                                    | [models.UpdatePlanOnDecrease](../models/updateplanondecrease.md) | :heavy_check_mark:                                               | Credit behavior when quantity decreases mid-cycle.               |