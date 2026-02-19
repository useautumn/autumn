# BillingAttachRequiredAction

Details about any action required to complete the payment. Present when the payment could not be processed automatically.


## Fields

| Field                                                        | Type                                                         | Required                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `code`                                                       | [models.BillingAttachCode](../models/billingattachcode.md)   | :heavy_check_mark:                                           | The type of action required to complete the payment.         |
| `reason`                                                     | *str*                                                        | :heavy_check_mark:                                           | A human-readable explanation of why this action is required. |