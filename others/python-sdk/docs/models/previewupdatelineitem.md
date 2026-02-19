# PreviewUpdateLineItem


## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `title`                                                                  | *str*                                                                    | :heavy_check_mark:                                                       | The title of the line item.                                              |
| `description`                                                            | *str*                                                                    | :heavy_check_mark:                                                       | A detailed description of the line item.                                 |
| `amount`                                                                 | *float*                                                                  | :heavy_check_mark:                                                       | The amount in cents for this line item.                                  |
| `discounts`                                                              | List[[models.PreviewUpdateDiscount](../models/previewupdatediscount.md)] | :heavy_minus_sign:                                                       | List of discounts applied to this line item.                             |