# PreviewUpdateLineItem

## Example Usage

```typescript
import { PreviewUpdateLineItem } from "@useautumn/sdk";

let value: PreviewUpdateLineItem = {
  title: "<value>",
  description: "summary embody unto swat distorted but",
  amount: 7427.09,
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `title`                                                                | *string*                                                               | :heavy_check_mark:                                                     | The title of the line item.                                            |
| `description`                                                          | *string*                                                               | :heavy_check_mark:                                                     | A detailed description of the line item.                               |
| `amount`                                                               | *number*                                                               | :heavy_check_mark:                                                     | The amount in cents for this line item.                                |
| `discounts`                                                            | [models.PreviewUpdateDiscount](../models/preview-update-discount.md)[] | :heavy_minus_sign:                                                     | List of discounts applied to this line item.                           |